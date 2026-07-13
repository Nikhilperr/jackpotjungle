import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/wallet.functions";
import { getDbClient } from "@/lib/admin-super.functions";
import { writeVipAuditLog } from "./audit.functions";

export async function ensureVipRewardSchema() {
  console.log("[SelfHealing] Connecting to database using shared getDbClient helper...");
  const client = await getDbClient();

  try {
    const migrationSql = `
      -- Create vip_reward_runs table
      CREATE TABLE IF NOT EXISTS public.vip_reward_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
        year INTEGER NOT NULL,
        reward_pool NUMERIC NOT NULL CHECK (reward_pool >= 0),
        status VARCHAR NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Calculated', 'Pending Review', 'Approved', 'Processing', 'Completed', 'Rejected', 'Locked')),
        total_qualified_users INTEGER NOT NULL DEFAULT 0,
        total_distributed_rewards NUMERIC NOT NULL DEFAULT 0,
        configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
        player_results JSONB NOT NULL DEFAULT '[]'::jsonb,
        logs TEXT[] NOT NULL DEFAULT '{}'::text[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        approved_at TIMESTAMPTZ,
        approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        locked_at TIMESTAMPTZ,
        CONSTRAINT unique_month_year UNIQUE (month, year)
      );

      -- Enable RLS
      ALTER TABLE public.vip_reward_runs ENABLE ROW LEVEL SECURITY;

      -- Create policy for super_admin
      DROP POLICY IF EXISTS "super_admins_all_vip_runs" ON public.vip_reward_runs;
      CREATE POLICY "super_admins_all_vip_runs" ON public.vip_reward_runs
        FOR ALL TO authenticated
        USING (public.has_role(auth.uid(), 'super_admin'));

      -- Grant permissions
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_reward_runs TO authenticated;
      GRANT ALL ON public.vip_reward_runs TO service_role;

      -- Add table to publication if not already added
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_publication_tables 
          WHERE pubname = 'supabase_realtime' AND tablename = 'vip_reward_runs'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_reward_runs;
        END IF;
      END $$;

      -- Ensure vip_reward_settings has run_time and timezone columns
      ALTER TABLE public.vip_reward_settings ADD COLUMN IF NOT EXISTS run_time VARCHAR NOT NULL DEFAULT '00:00';
      ALTER TABLE public.vip_reward_settings ADD COLUMN IF NOT EXISTS timezone VARCHAR NOT NULL DEFAULT 'America/New_York';

      -- Stored Procedure to safely, atomically execute payouts inside a database transaction
      CREATE OR REPLACE FUNCTION public.execute_vip_payouts(
        run_uuid UUID,
        admin_uuid UUID,
        admin_name_text TEXT
      )
      RETURNS JSONB AS $$
      DECLARE
        v_run RECORD;
        v_player RECORD;
        v_prev_avail NUMERIC;
        v_prev_credit NUMERIC;
        v_next_avail NUMERIC;
        v_month_name TEXT;
      BEGIN
        -- 1. Fetch and lock run row
        SELECT * INTO v_run FROM public.vip_reward_runs WHERE id = run_uuid FOR UPDATE;
        
        IF NOT FOUND THEN
          RAISE EXCEPTION 'VIP Reward run not found.';
        END IF;

        IF v_run.status <> 'Approved' THEN
          RAISE EXCEPTION 'Cannot execute payouts: Run is not approved.';
        END IF;

        -- Update status to Processing to block concurrent attempts
        UPDATE public.vip_reward_runs SET status = 'Processing' WHERE id = run_uuid;

        -- Get month name
        SELECT to_char(to_date(v_run.month::text, 'MM'), 'Month') INTO v_month_name;
        v_month_name := trim(v_month_name);

        -- 2. Process qualified player credits
        FOR v_player IN SELECT * FROM jsonb_to_recordset(v_run.player_results) AS x(
          user_id UUID,
          username TEXT,
          vip_status TEXT,
          deposit_score NUMERIC,
          holding_score NUMERIC,
          referral_score NUMERIC,
          loyalty_score NUMERIC,
          base_score NUMERIC,
          multiplier NUMERIC,
          final_score NUMERIC,
          final_reward NUMERIC,
          qualified BOOLEAN
        ) LOOP
          IF v_player.qualified = TRUE AND v_player.final_reward > 0 THEN
            -- Check if user has already been paid for this run to avoid duplicates and allow resuming
            IF EXISTS (
              SELECT 1 FROM public.vip_player_rewards 
              WHERE run_id = run_uuid AND user_id = v_player.user_id
            ) THEN
              CONTINUE;
            END IF;

            -- Fetch and lock profile row
            SELECT wallet_balance, credit_balance INTO v_prev_avail, v_prev_credit 
            FROM public.profiles WHERE id = v_player.user_id FOR UPDATE;

            IF FOUND THEN
              v_next_avail := v_prev_avail + v_player.final_reward;

              -- Update profile
              UPDATE public.profiles SET 
                wallet_balance = v_next_avail, 
                wallet_last_updated = now() 
              WHERE id = v_player.user_id;

              -- Insert transaction record
              INSERT INTO public.wallet_transactions (
                user_id, admin_id, admin_name, action, amount,
                avail_before, avail_after, credit_before, credit_after,
                reason, notes
              ) VALUES (
                v_player.user_id, admin_uuid, admin_name_text, 'bonus', v_player.final_reward,
                v_prev_avail, v_next_avail, v_prev_credit, v_prev_credit,
                'VIP Loyalty Payout - ' || v_month_name || ' ' || v_run.year::text,
                'Automatically distributed after Super Admin approval.'
              );

              -- Insert user notification
              INSERT INTO public.user_notifications (user_id, title, content)
              VALUES (
                v_player.user_id,
                'VIP Loyalty Payout',
                'You received a loyalty bonus of $' || to_char(v_player.final_reward, 'FM999,999,990.00') || ' into your Available Balance.'
              );

              -- Insert player reward history record
              INSERT INTO public.vip_player_rewards (
                run_id, user_id, username, month, year, vip_status,
                deposit_score, holding_score, referral_score, loyalty_score,
                base_score, multiplier, final_score, reward_amount,
                distribution_date, approval_status
              ) VALUES (
                run_uuid, v_player.user_id, v_player.username, v_run.month, v_run.year, COALESCE(v_player.vip_status, 'none'),
                COALESCE(v_player.deposit_score, 0), COALESCE(v_player.holding_score, 0), COALESCE(v_player.referral_score, 0), COALESCE(v_player.loyalty_score, 0),
                COALESCE(v_player.base_score, 0), COALESCE(v_player.multiplier, 1.0), COALESCE(v_player.final_score, 0), v_player.final_reward,
                now(), 'Completed'
              );
            END IF;
          END IF;
        END LOOP;

        -- Update status to Completed
        UPDATE public.vip_reward_runs SET 
          status = 'Completed',
          approved_at = now(),
          approved_by = admin_uuid,
          updated_at = now(),
          updated_by = admin_uuid
        WHERE id = run_uuid;

        RETURN jsonb_build_object(
          'success', true,
          'message', 'Payout execution completed successfully.'
        );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      -- Create public.vip_player_rewards table
      CREATE TABLE IF NOT EXISTS public.vip_player_rewards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES public.vip_reward_runs(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        username VARCHAR NOT NULL,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        vip_status VARCHAR NOT NULL,
        deposit_score NUMERIC NOT NULL,
        holding_score NUMERIC NOT NULL,
        referral_score NUMERIC NOT NULL,
        loyalty_score NUMERIC NOT NULL,
        base_score NUMERIC NOT NULL,
        multiplier NUMERIC NOT NULL,
        final_score NUMERIC NOT NULL,
        reward_amount NUMERIC NOT NULL,
        distribution_date TIMESTAMPTZ NOT NULL,
        approval_status VARCHAR NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT unique_run_user UNIQUE (run_id, user_id)
      );

      -- Ensure unique constraint exists on older tables
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_run_user'
        ) THEN
          ALTER TABLE public.vip_player_rewards ADD CONSTRAINT unique_run_user UNIQUE (run_id, user_id);
        END IF;
      END $$;

      -- Enable RLS on vip_player_rewards
      ALTER TABLE public.vip_player_rewards ENABLE ROW LEVEL SECURITY;

      -- Policies for vip_player_rewards
      DROP POLICY IF EXISTS "user_view_own_vip_player_rewards" ON public.vip_player_rewards;
      CREATE POLICY "user_view_own_vip_player_rewards" ON public.vip_player_rewards
        FOR SELECT TO authenticated
        USING (
          auth.uid() = user_id OR
          public.has_role(auth.uid(), 'super_admin'::app_role) OR
          public.has_role(auth.uid(), 'admin'::app_role)
        );

      -- Create public.vip_audit_logs table
      CREATE TABLE IF NOT EXISTS public.vip_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        username VARCHAR NOT NULL,
        role VARCHAR NOT NULL,
        action VARCHAR NOT NULL,
        previous_value JSONB,
        new_value JSONB,
        ip_address VARCHAR,
        device_info VARCHAR
      );

      -- Enable RLS on vip_audit_logs
      ALTER TABLE public.vip_audit_logs ENABLE ROW LEVEL SECURITY;

      -- Policies for vip_audit_logs: only admins/super admins can select
      DROP POLICY IF EXISTS "admins_view_all_vip_audit_logs" ON public.vip_audit_logs;
      CREATE POLICY "admins_view_all_vip_audit_logs" ON public.vip_audit_logs
        FOR SELECT TO authenticated
        USING (
          public.has_role(auth.uid(), 'super_admin'::app_role) OR
          public.has_role(auth.uid(), 'admin'::app_role)
        );

      -- Grant permissions
      GRANT SELECT ON public.vip_player_rewards TO authenticated;
      GRANT ALL ON public.vip_player_rewards TO service_role;

      GRANT SELECT ON public.vip_audit_logs TO authenticated;
      GRANT ALL ON public.vip_audit_logs TO service_role;

      -- Add tables to realtime publication if not already present
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_publication_tables 
          WHERE pubname = 'supabase_realtime' AND tablename = 'vip_player_rewards'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_player_rewards;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_publication_tables 
          WHERE pubname = 'supabase_realtime' AND tablename = 'vip_audit_logs'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_audit_logs;
        END IF;
      END $$;

      NOTIFY pgrst, 'reload schema';
    `;
    await client.query(migrationSql);
    console.log("[SelfHealing] VIP Schema deployed successfully!");
  } finally {
    try { await client.end(); } catch {}
  }
}

const getRunValidator = z.object({
  month: z.number().min(1).max(12),
  year: z.number(),
});

const saveDraftValidator = z.object({
  month: z.number().min(1).max(12),
  year: z.number(),
  status: z.enum(["Calculated", "Pending Review"]),
  rewardPool: z.number(),
  totalQualifiedUsers: z.number(),
  totalDistributedRewards: z.number(),
  configuration: z.any(),
  playerResults: z.array(z.any()),
  logs: z.array(z.string()),
});

const updateStatusValidator = z.object({
  runId: z.string().uuid(),
  status: z.enum(["Pending Review", "Approved", "Rejected", "Locked"]),
});

const executePayoutsValidator = z.object({
  runId: z.string().uuid(),
});

/**
 * Server Function: getVipRewardRun
 * Fetches the database run status for a given month and year.
 */
export const getVipRewardRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(getRunValidator)
  .handler(async ({ data, context }) => {
    try {
      await assertAdmin(context.supabase, context.userId);

      let run = null;
      let dbError = null;

      try {
        const { data: fetchRun, error } = await context.supabase
          .from("vip_reward_runs")
          .select("*")
          .eq("month", data.month)
          .eq("year", data.year)
          .maybeSingle();

        if (error) {
          dbError = error;
        } else {
          run = fetchRun;
        }
      } catch (err: any) {
        dbError = err;
      }

      // Check for table-not-found / schema-cache issues
      if (dbError && (dbError.message?.includes("does not exist") || dbError.message?.includes("schema cache") || String(dbError).includes("does not exist") || String(dbError).includes("schema cache"))) {
        console.warn("[getVipRewardRun] Table public.vip_reward_runs is missing. Executing self-healing deployment...");
        await ensureVipRewardSchema();

        // Retry the select
        const { data: retryRun, error: retryErr } = await context.supabase
          .from("vip_reward_runs")
          .select("*")
          .eq("month", data.month)
          .eq("year", data.year)
          .maybeSingle();

        if (retryErr) throw new Error(retryErr.message);
        run = retryRun;
      } else if (dbError) {
        throw new Error(dbError.message || String(dbError));
      }

      return {
        success: true,
        run: run || null,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

/**
 * Server Function: saveVipRewardRunDraft
 * Creates or updates a monthly reward run draft (with status Calculated or Pending Review).
 */
export const saveVipRewardRunDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(saveDraftValidator)
  .handler(async ({ data, context }) => {
    try {
      const { isSuperAdmin } = await assertAdmin(context.supabase, context.userId);
      if (!isSuperAdmin) throw new Error("Unauthorized: Super Admin access only.");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Check if run already exists
      let existingRun = null;
      let dbError = null;
      try {
        const { data: fetchRun, error } = await supabaseAdmin
          .from("vip_reward_runs")
          .select("id, status")
          .eq("month", data.month)
          .eq("year", data.year)
          .maybeSingle();
        if (error) {
          dbError = error;
        } else {
          existingRun = fetchRun;
        }
      } catch (err: any) {
        dbError = err;
      }

      // Check for table-not-found / schema-cache issues
      if (dbError && (dbError.message?.includes("does not exist") || dbError.message?.includes("schema cache") || String(dbError).includes("does not exist") || String(dbError).includes("schema cache"))) {
        console.warn("[saveVipRewardRunDraft] Table public.vip_reward_runs is missing. Executing self-healing deployment...");
        await ensureVipRewardSchema();

        // Retry the fetch
        const { data: retryRun, error: retryErr } = await supabaseAdmin
          .from("vip_reward_runs")
          .select("id, status")
          .eq("month", data.month)
          .eq("year", data.year)
          .maybeSingle();

        if (retryErr) throw new Error(retryErr.message);
        existingRun = retryRun;
      } else if (dbError) {
        throw new Error(dbError.message || String(dbError));
      }

      if (existingRun) {
        if (existingRun.status === "Locked" || existingRun.status === "Completed") {
          throw new Error(`Cannot recalculate or save draft: Month is ${existingRun.status}.`);
        }
      }

      const payload = {
        month: data.month,
        year: data.year,
        reward_pool: data.rewardPool,
        status: data.status,
        total_qualified_users: data.totalQualifiedUsers,
        total_distributed_rewards: data.totalDistributedRewards,
        configuration: data.configuration,
        player_results: data.playerResults,
        logs: data.logs,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      };

      let result;
      if (existingRun) {
        // Update existing run
        const { data: updated, error } = await supabaseAdmin
          .from("vip_reward_runs")
          .update(payload)
          .eq("id", existingRun.id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        // Insert new run
        const { data: inserted, error } = await supabaseAdmin
          .from("vip_reward_runs")
          .insert({
            ...payload,
            created_by: context.userId,
          })
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        result = inserted;
      }

      // Write Audit Log
      const auditAction = existingRun ? "reward_recalculated" : "draft_saved";
      await writeVipAuditLog(supabaseAdmin, context.userId, auditAction, existingRun || null, {
        runId: result.id,
        month: result.month,
        year: result.year,
        status: result.status,
        rewardPool: result.reward_pool,
        totalQualifiedUsers: result.total_qualified_users,
        totalDistributedRewards: result.total_distributed_rewards
      });

      return {
        success: true,
        run: result,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

/**
 * Server Function: updateVipRewardRunStatus
 * Updates the state transition of a monthly run (Pending Review, Approved, Rejected, Locked).
 */
export const updateVipRewardRunStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(updateStatusValidator)
  .handler(async ({ data, context }) => {
    try {
      const { isSuperAdmin } = await assertAdmin(context.supabase, context.userId);
      if (!isSuperAdmin) throw new Error("Unauthorized: Super Admin access only.");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Fetch current run state
      const { data: run, error: fetchErr } = await supabaseAdmin
        .from("vip_reward_runs")
        .select("*")
        .eq("id", data.runId)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
      if (!run) throw new Error("VIP Reward run not found.");

      const currentStatus = run.status;
      const targetStatus = data.status;

      // ENFORCE STATE LIFECYCLE TRANSITIONS
      if (targetStatus === "Pending Review") {
        if (currentStatus !== "Calculated" && currentStatus !== "Rejected") {
          throw new Error(`Invalid Transition: Cannot submit for review from "${currentStatus}" status.`);
        }
      } else if (targetStatus === "Approved") {
        if (currentStatus !== "Pending Review") {
          throw new Error(`Invalid Transition: Cannot approve run from "${currentStatus}" status. Run must be "Pending Review".`);
        }
      } else if (targetStatus === "Rejected") {
        if (currentStatus !== "Pending Review" && currentStatus !== "Approved") {
          throw new Error(`Invalid Transition: Cannot reject run from "${currentStatus}" status. Run must be "Pending Review" or "Approved".`);
        }
      } else if (targetStatus === "Locked") {
        if (currentStatus !== "Completed") {
          throw new Error(`Invalid Transition: Only completed monthly payouts can be locked.`);
        }
      }

      const updates: any = {
        status: targetStatus,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      };

      if (targetStatus === "Locked") {
        updates.locked_at = new Date().toISOString();
      }

      const { data: updatedRun, error: updateErr } = await supabaseAdmin
        .from("vip_reward_runs")
        .update(updates)
        .eq("id", data.runId)
        .select("*")
        .single();

      if (updateErr) throw new Error(updateErr.message);

      // Write Audit Log
      let auditAction = "";
      if (targetStatus === "Pending Review") auditAction = "submit_for_review";
      else if (targetStatus === "Approved") auditAction = "reward_approved";
      else if (targetStatus === "Rejected") auditAction = "reward_rejected";
      else if (targetStatus === "Locked") auditAction = "month_locked";

      if (auditAction) {
        await writeVipAuditLog(
          supabaseAdmin,
          context.userId,
          auditAction,
          { status: currentStatus },
          { status: targetStatus, runId: data.runId, month: run.month, year: run.year }
        );
      }

      return {
        success: true,
        run: updatedRun,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

/**
 * Server Function: executeVipRewardRunPayouts
 * Validates variables and executes wallet credits atomically via the execute_vip_payouts procedure.
 */
export const executeVipRewardRunPayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(executePayoutsValidator)
  .handler(async ({ data, context }) => {
    try {
      const { isSuperAdmin } = await assertAdmin(context.supabase, context.userId);
      if (!isSuperAdmin) throw new Error("Unauthorized: Super Admin access only.");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Fetch current run data
      const { data: run, error: fetchErr } = await supabaseAdmin
        .from("vip_reward_runs")
        .select("*")
        .eq("id", data.runId)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
      if (!run) throw new Error("VIP Reward run not found.");

      if (run.status !== "Approved") {
        throw new Error(`Execution Denied: Run is in status "${run.status}" (Must be "Approved").`);
      }

      // Fetch admin details for execution
      const { data: adminProf } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, username")
        .eq("id", context.userId)
        .single();

      const adminName = adminProf?.first_name
        ? `${adminProf.first_name} ${adminProf.last_name || ""}`.trim()
        : adminProf?.username || "System Administrator";

      // 1. RUN STRICT BACKEND INTEGRITY VALIDATIONS
      const rewardPool = Number(run.reward_pool);
      const totalDistributedRewards = Number(run.total_distributed_rewards);
      const playerResults = Array.isArray(run.player_results) ? run.player_results : [];
      const config = run.configuration || {};
      const capPercentage = Number(config.reward_cap_percentage || 10.0);

      // Check: Sum matches pool size
      if (Math.abs(rewardPool - totalDistributedRewards) > 0.01) {
        throw new Error(`Validation Error: Target Reward Pool ($${rewardPool.toFixed(2)}) does not match Total Payouts ($${totalDistributedRewards.toFixed(2)}).`);
      }

      // Check: Duplicate recipient user profiles
      const recipientIds = new Set<string>();
      for (const p of playerResults) {
        if (!p.qualified) continue;
        
        if (p.final_reward < 0) {
          throw new Error(`Validation Error: Negative reward amount found for player @${p.username}.`);
        }

        if (recipientIds.has(p.user_id)) {
          throw new Error(`Validation Error: Duplicate recipient user ID ${p.user_id} found in payout array.`);
        }
        recipientIds.add(p.user_id);

        // Check: Individual reward cap
        const maxAllowedCap = rewardPool * (capPercentage / 100);
        // Fallback: If all players are capped, they may exceed the limit proportionally, 
        // so we check if there's any active uncapped player that exceeds the cap.
        const uncappedCount = playerResults.filter((u: any) => u.qualified && !u.cap_applied).length;
        if (uncappedCount > 0 && p.final_reward > (maxAllowedCap + 0.01)) {
          throw new Error(`Validation Error: Player @${p.username} reward ($${p.final_reward.toFixed(2)}) exceeds pool cap allocation ($${maxAllowedCap.toFixed(2)}).`);
        }

        // Check: Valid user ID exists in profiles
        const { data: profileCheck } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", p.user_id)
          .maybeSingle();

        if (!profileCheck) {
          throw new Error(`Validation Error: Recipient profile user ID ${p.user_id} is invalid or deleted.`);
        }
      }

      // 2. TRIGGER PL/pgSQL ATOMIC DATABASE TRANSACTION
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("execute_vip_payouts", {
        run_uuid: data.runId,
        admin_uuid: context.userId,
        admin_name_text: adminName,
      });

      if (rpcErr) {
        // Reset status back to Approved if transaction rolled back
        await supabaseAdmin
          .from("vip_reward_runs")
          .update({ status: "Approved" })
          .eq("id", data.runId);

        throw new Error(`Database Execution Failed: ${rpcErr.message}`);
      }

      // Write Audit Log
      await writeVipAuditLog(supabaseAdmin, context.userId, "wallet_distribution_executed", null, {
        runId: data.runId,
        month: run.month,
        year: run.year,
        rewardPool: run.reward_pool,
        totalDistributedRewards: run.total_distributed_rewards,
        totalQualifiedUsers: run.total_qualified_users
      });

      // 3. Trigger Push Notifications for paid users who have push tokens
      try {
        const paidUsers = playerResults.filter((p: any) => p.qualified && Number(p.final_reward) > 0);
        if (paidUsers.length > 0) {
          const userIds = paidUsers.map((p: any) => p.user_id);
          const { data: tokenRows } = await supabaseAdmin
            .from("push_tokens")
            .select("user_id, token")
            .in("user_id", userIds);

          if (tokenRows && tokenRows.length > 0) {
            const { sendPushNotification } = await import("@/lib/fcm.server");
            
            for (const p of paidUsers) {
              const userTokens = tokenRows
                .filter((r: any) => r.user_id === p.user_id)
                .map((r: any) => r.token);

              if (userTokens.length > 0) {
                const title = "VIP Loyalty Payout";
                const body = `You received a loyalty bonus of $${Number(p.final_reward).toFixed(2)} into your Available Balance.`;
                await sendPushNotification(userTokens, title, body, {
                  type: "vip_payout",
                  routePath: "/app/profile",
                });
              }
            }
          }
        }
      } catch (notifErr: any) {
        console.error("[executeVipRewardRunPayouts] FCM notifications failed:", notifErr.message || notifErr);
      }

      return {
        success: true,
        result: rpcRes,
      };

    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
