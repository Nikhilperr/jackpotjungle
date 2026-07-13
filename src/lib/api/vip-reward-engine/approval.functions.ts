import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/wallet.functions";

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

      const { data: run, error } = await context.supabase
        .from("vip_reward_runs")
        .select("*")
        .eq("month", data.month)
        .eq("year", data.year)
        .maybeSingle();

      if (error) throw new Error(error.message);

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
      const { data: existingRun } = await supabaseAdmin
        .from("vip_reward_runs")
        .select("id, status")
        .eq("month", data.month)
        .eq("year", data.year)
        .maybeSingle();

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
