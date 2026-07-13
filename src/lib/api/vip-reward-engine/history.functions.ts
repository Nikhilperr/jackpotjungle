import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/wallet.functions";

/**
 * Server Function: getUserRewardHistory
 * Allows a standard user to view their own VIP reward history rows.
 */
export const getUserRewardHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data: rows, error } = await context.supabase
        .from("vip_player_rewards")
        .select("*")
        .eq("user_id", context.userId)
        .order("distribution_date", { ascending: false });

      if (error) throw new Error(error.message);

      return {
        success: true,
        history: rows ?? [],
      };
    } catch (e: any) {
      console.error("[getUserRewardHistory Error]:", e.message);
      return { success: false, error: e.message };
    }
  });

const getCycleHistoryValidator = z.object({
  month: z.number().optional(),
  year: z.number().optional(),
  status: z.string().optional(),
});

/**
 * Server Function: getMonthlyCycleHistory
 * Allows admins to view completed/locked monthly cycles with calculated aggregates.
 */
export const getMonthlyCycleHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(getCycleHistoryValidator)
  .handler(async ({ data, context }) => {
    try {
      await assertAdmin(context.supabase, context.userId);

      let query = context.supabase
        .from("vip_reward_runs")
        .select("*")
        .in("status", ["Completed", "Locked"])
        .order("year", { ascending: false })
        .order("month", { ascending: false });

      if (data.month && data.month !== 0) {
        query = query.eq("month", data.month);
      }
      if (data.year && data.year !== 0) {
        query = query.eq("year", data.year);
      }
      if (data.status && data.status !== "all") {
        query = query.eq("status", data.status);
      }

      const { data: runs, error } = await query;
      if (error) throw new Error(error.message);

      // Fetch admin user names for approved_by ids
      const adminIds = Array.from(new Set((runs ?? []).map(r => r.approved_by).filter(Boolean)));
      const adminsMap: Record<string, string> = {};
      
      if (adminIds.length > 0) {
        const { data: admins } = await context.supabase
          .from("profiles")
          .select("id, username, first_name, last_name")
          .in("id", adminIds);
        
        for (const admin of admins ?? []) {
          const name = admin.first_name
            ? `${admin.first_name} ${admin.last_name || ""}`.trim()
            : admin.username;
          adminsMap[admin.id] = name;
        }
      }

      // Compute cycle aggregates from player_results JSONB array
      const cycles = (runs ?? []).map((run: any) => {
        let monthlyDeposits = 0;
        let monthlyCashouts = 0;
        let monthlyHolding = 0;

        const results = Array.isArray(run.player_results) ? run.player_results : [];
        for (const p of results) {
          monthlyDeposits += Number(p.monthly_deposit || 0);
          monthlyCashouts += Number(p.monthly_cashout || 0);
          monthlyHolding += Number(p.monthly_holding || 0);
        }

        const approvedByName = run.approved_by ? (adminsMap[run.approved_by] || "System Admin") : "N/A";

        return {
          id: run.id,
          month: run.month,
          year: run.year,
          reward_pool: Number(run.reward_pool),
          monthly_deposits: Number(monthlyDeposits.toFixed(2)),
          monthly_cashouts: Number(monthlyCashouts.toFixed(2)),
          monthly_holding: Number(monthlyHolding.toFixed(2)),
          total_qualified_players: run.total_qualified_users,
          total_distributed_amount: Number(run.total_distributed_rewards),
          status: run.status,
          approved_at: run.approved_at,
          approved_by: run.approved_by,
          approved_by_name: approvedByName,
          created_at: run.created_at,
          completed_at: run.locked_at || run.approved_at, // Completed when approved, final locked date is locked_at
          logs: run.logs,
          configuration: run.configuration,
          player_results: results,
        };
      });

      return {
        success: true,
        cycles,
      };
    } catch (e: any) {
      console.error("[getMonthlyCycleHistory Error]:", e.message);
      return { success: false, error: e.message };
    }
  });

const getPlayerHistoryValidator = z.object({
  month: z.number().optional(),
  year: z.number().optional(),
  username: z.string().optional(),
  vipLevel: z.string().optional(),
});

/**
 * Server Function: getVipPlayerHistoryAll
 * Allows admins to view all historical payouts to individual players.
 */
export const getVipPlayerHistoryAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(getPlayerHistoryValidator)
  .handler(async ({ data, context }) => {
    try {
      await assertAdmin(context.supabase, context.userId);

      let query = context.supabase
        .from("vip_player_rewards")
        .select("*")
        .order("distribution_date", { ascending: false });

      if (data.month && data.month !== 0) {
        query = query.eq("month", data.month);
      }
      if (data.year && data.year !== 0) {
        query = query.eq("year", data.year);
      }
      if (data.username && data.username.trim() !== "") {
        query = query.ilike("username", `%${data.username}%`);
      }
      if (data.vipLevel && data.vipLevel !== "all") {
        query = query.eq("vip_status", data.vipLevel);
      }

      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);

      return {
        success: true,
        history: rows ?? [],
      };
    } catch (e: any) {
      console.error("[getVipPlayerHistoryAll Error]:", e.message);
      return { success: false, error: e.message };
    }
  });
