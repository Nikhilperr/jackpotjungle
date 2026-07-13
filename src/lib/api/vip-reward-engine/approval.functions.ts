import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/wallet.functions";

async function resolveHostToIPv4(host: string, dns: any): Promise<string> {
  if (host === "localhost" || host === "127.0.0.1") return host;
  try {
    const addresses = await dns.promises.resolve4(host);
    if (addresses && addresses.length > 0) {
      return addresses[0];
    }
  } catch (err: any) {
    // quiet
  }
  return host;
}

export async function ensureVipRewardSchema() {
  const pg = (await import("pg")).default;
  const dns = await import("dns");

  if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
  }

  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD || "grootMahakal7X";
  const dbName = process.env.SUPABASE_DB_NAME || process.env.DATABASE_NAME || "postgres";
  const errors: string[] = [];
  let client;
  let success = false;

  // 1. Try DATABASE_URL first
  if (process.env.DATABASE_URL) {
    let connUrlStr = process.env.DATABASE_URL;
    let sslVal: any = undefined;
    const maskedUrl = process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":****@");

    try {
      console.log("[SelfHealing] Found DATABASE_URL, attempting connection...");

      const parsePostgresConfig = (connStr: string) => {
        let host = "";
        let port = "5432";
        let user = "postgres";
        let password = "";
        let database = "postgres";

        if (connStr.includes("://")) {
          try {
            const url = new URL(connStr);
            host = url.hostname;
            port = url.port || "5432";
            user = url.username;
            password = url.password;
            database = url.pathname.replace(/^\//, "");
          } catch (e) {}
        } else {
          const pairs = connStr.split(/\s+/);
          for (const pair of pairs) {
            const [k, v] = pair.split("=");
            if (k && v) {
              const cleanV = v.replace(/(^["']|["']$)/g, "");
              if (k === "host") host = cleanV;
              else if (k === "port") port = cleanV;
              else if (k === "user") user = cleanV;
              else if (k === "password") password = cleanV;
              else if (k === "dbname") database = cleanV;
            }
          }
        }
        return { host, port, user, password, database };
      };

      const config = parsePostgresConfig(connUrlStr);
      const resolvedHost = await resolveHostToIPv4(config.host, dns);
      const isRemote = config.host && config.host !== "localhost" && config.host !== "127.0.0.1" && config.host !== "db";

      // Only append project ref suffix if the host explicitly matches a Supabase project domain
      const match = config.host.match(/^db\.([a-z0-9]+)\.supabase\.(co|net)$/i);
      if (match) {
        const projectRef = match[1];
        if (projectRef && !config.user.includes(".")) {
          config.user = `${config.user}.${projectRef}`;
        }
      }

      let servername = undefined;
      if (isRemote && match) {
        servername = config.host;
      }

      connUrlStr = `postgres://${config.user}:${config.password}@${resolvedHost}:${config.port}/${config.database}`;
      sslVal = servername ? { rejectUnauthorized: false, servername } : undefined;

      client = new pg.Client({
        connectionString: connUrlStr,
        ssl: sslVal
      });

      await client.connect();
      success = true;
      console.log("[SelfHealing] Connected successfully using DATABASE_URL!");
    } catch (e: any) {
      errors.push(`DATABASE_URL (${maskedUrl}) with SSL: ${e.message}`);
      console.warn("[SelfHealing] DATABASE_URL connection attempt failed with SSL:", e.message);
      try { if (client) await client.end(); } catch {}
      client = null;

      if (sslVal) {
        try {
          console.log("[SelfHealing] Retrying DATABASE_URL without SSL...");
          client = new pg.Client({
            connectionString: connUrlStr,
            ssl: undefined
          });
          await client.connect();
          success = true;
          console.log("[SelfHealing] Connected successfully using DATABASE_URL without SSL!");
        } catch (e2: any) {
          errors.push(`DATABASE_URL (${maskedUrl}) without SSL: ${e2.message}`);
          console.warn("[SelfHealing] DATABASE_URL connection attempt failed without SSL:", e2.message);
          try { if (client) await client.end(); } catch {}
          client = null;
        }
      }
    }
  }

  // 2. Try configured connection settings fallback
  if (!success) {
    const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD || "grootMahakal7X";
    const dbName = process.env.SUPABASE_DB_NAME || process.env.DATABASE_NAME || "postgres";
    const username = process.env.SUPABASE_DB_USER || process.env.DATABASE_USER || "postgres";

    const configuredHost = process.env.SUPABASE_DB_HOST || process.env.DATABASE_HOST;
    const hosts = configuredHost ? [configuredHost] : ["localhost", "127.0.0.1", "db.gsnhqzsgptqxtlhggzkz.supabase.co", "db.chancerealm.casino", "db"];

    const configuredPort = process.env.SUPABASE_DB_PORT || process.env.DATABASE_PORT;
    const ports = configuredPort ? [parseInt(configuredPort, 10)] : [5432, 6543];

    for (const h of hosts) {
      for (const p of ports) {
        try {
          const resolvedHost = await resolveHostToIPv4(h, dns);
          const isRemote = h.includes(".") && !h.startsWith("127.");
          
          let candidateUsername = username;
          let projectRef = "";
          
          // Only append project ref suffix if the host explicitly matches a Supabase project domain
          const match = h.match(/^db\.([a-z0-9]+)\.supabase\.(co|net)$/i);
          if (match) {
            projectRef = match[1];
            if (projectRef && !candidateUsername.includes(".")) {
              candidateUsername = `${candidateUsername}.${projectRef}`;
            }
          }

          const sslVal = (isRemote && match) ? { rejectUnauthorized: false, servername: h } : undefined;

          try {
            client = new pg.Client({
              connectionString: `postgres://${candidateUsername}:${dbPassword}@${resolvedHost}:${p}/${dbName}`,
              ssl: sslVal
            });
            await client.connect();
            success = true;
            break;
          } catch (err: any) {
            errors.push(`Host ${h}:${p} (${candidateUsername}) with SSL: ${err.message}`);
            
            if (sslVal) {
              try {
                client = new pg.Client({
                  connectionString: `postgres://${candidateUsername}:${dbPassword}@${resolvedHost}:${p}/${dbName}`,
                  ssl: undefined
                });
                await client.connect();
                success = true;
                break;
              } catch (err2: any) {
                errors.push(`Host ${h}:${p} (${candidateUsername}) without SSL: ${err2.message}`);
              }
            }
          }
        } catch (err: any) {
          errors.push(`Host ${h}:${p} resolution: ${err.message}`);
        }
      }
      if (success) break;
    }
  }

  if (!success || !client) {
    throw new Error(`Self-healing schema deployment failed: could not connect to database. Details:\n- ${errors.join('\n- ')}`);
  }

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
          final_reward NUMERIC,
          qualified BOOLEAN
        ) LOOP
          IF v_player.qualified = TRUE AND v_player.final_reward > 0 THEN
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
        if (currentStatus !== "Pending Review") {
          throw new Error(`Invalid Transition: Cannot reject run from "${currentStatus}" status. Run must be "Pending Review".`);
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

      return {
        success: true,
        result: rpcRes,
      };

    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
