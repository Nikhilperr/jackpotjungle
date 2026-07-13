import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/wallet.functions";
import { ConfigReaderService } from "./config-reader.service";

const getStatsValidator = z.object({
  month: z.number().min(1).max(12).optional(),
  year: z.number().optional(),
});

const getReportsValidator = z.object({
  type: z.enum(["monthly_reward", "vip", "referral", "distribution", "qualification"]),
  month: z.number().min(1).max(12).optional(),
  year: z.number().optional(),
  vipStatus: z.string().optional(),
  status: z.string().optional(),
  username: z.string().optional(),
  referralStatus: z.string().optional(),
});

/**
 * Server Function: getVipDashboardStats
 * Fetches analytics, charts, financial metrics, and operational counters.
 * Respects RBAC: Super Admins receive full executive financials, regular Admins receive operational lists.
 */
export const getVipDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(getStatsValidator)
  .handler(async ({ data, context }) => {
    try {
      const { isSuperAdmin } = await assertAdmin(context.supabase, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const activeMonth = data.month ?? new Date().getMonth() + 1;
      const activeYear = data.year ?? new Date().getFullYear();

      // Define date range for current month financial stats
      const startDate = new Date(Date.UTC(activeYear, activeMonth - 1, 1)).toISOString();
      const endDate = new Date(Date.UTC(activeYear, activeMonth, 1, 0, 0, 0, -1)).toISOString();

      // 1. Fetch completed runs to compile chart data
      const { data: runs, error: runsErr } = await supabaseAdmin
        .from("vip_reward_runs")
        .select("*")
        .order("year", { ascending: true })
        .order("month", { ascending: true });

      if (runsErr) throw new Error(runsErr.message);

      // Build charts history (last 12 completed runs or active month data points)
      const chartPoints = (runs ?? []).map((run: any, idx: number, arr: any[]) => {
        // Calculate growth compared to previous completed run
        let growthRate = 0;
        if (idx > 0 && Number(arr[idx - 1].total_distributed_rewards) > 0) {
          const prev = Number(arr[idx - 1].total_distributed_rewards);
          const curr = Number(run.total_distributed_rewards);
          growthRate = ((curr - prev) / prev) * 100;
        }

        // Sum deposits and cashouts from player results if completed
        let runDeposits = 0;
        let runCashouts = 0;
        if (Array.isArray(run.player_results)) {
          for (const player of run.player_results) {
            runDeposits += Number(player.monthly_deposit || 0);
            runCashouts += Number(player.monthly_cashout || 0);
          }
        }

        const monthName = new Date(0, run.month - 1).toLocaleString("en", { month: "short" });

        return {
          month: run.month,
          year: run.year,
          label: `${monthName} ${run.year}`,
          deposits: Number(runDeposits.toFixed(2)),
          cashouts: Number(runCashouts.toFixed(2)),
          holding: Number((runDeposits - runCashouts).toFixed(2)),
          rewardPool: Number(run.reward_pool),
          distributedRewards: Number(run.total_distributed_rewards),
          growthRate: Number(growthRate.toFixed(2)),
          qualifiedPlayers: run.total_qualified_users,
        };
      });

      // Find current selected month's calculation runs
      const currentPeriodRun = (runs ?? []).find(r => r.month === activeMonth && r.year === activeYear);

      // 2. Fetch current month total deposits and cashouts directly from transactions for the active card
      let monthlyDeposits = 0;
      let monthlyCashouts = 0;

      if (isSuperAdmin) {
        const { data: txs } = await supabaseAdmin
          .from("wallet_transactions")
          .select("action, amount")
          .eq("deleted", false)
          .gte("created_at", startDate)
          .lte("created_at", endDate)
          .in("action", ["cashin", "cashout"]);

        if (txs) {
          for (const tx of txs) {
            const amt = Number(tx.amount || 0);
            if (tx.action === "cashin") monthlyDeposits += amt;
            else if (tx.action === "cashout") monthlyCashouts += amt;
          }
        }
      }

      // 3. Fetch general system stats
      // VIP Tier counts (Active profiles count by tier)
      const { data: profiles, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("vip_status, created_at");

      if (profErr) throw new Error(profErr.message);

      const vipCounts: Record<string, number> = {
        none: 0,
        bronze: 0,
        silver: 0,
        gold: 0,
        platinum: 0,
        diamond: 0,
        black_diamond: 0,
      };

      let newPlayersCount = 0;
      for (const p of (profiles ?? [])) {
        const status = (p.vip_status || "none").toLowerCase().replace(/[\s-]+/g, "_");
        if (vipCounts[status] !== undefined) {
          vipCounts[status]++;
        } else {
          vipCounts.none++;
        }

        // New players in selected period
        if (p.created_at >= startDate && p.created_at <= endDate) {
          newPlayersCount++;
        }
      }

      // Referral stats count
      const { data: referralRows } = await supabaseAdmin
        .from("referrals")
        .select("status");
      const referralStats = {
        total: referralRows?.length || 0,
        pending: referralRows?.filter(r => r.status === "pending").length || 0,
        joined: referralRows?.filter(r => r.status === "joined").length || 0,
      };

      // Extract results from active period run
      const playerResults = currentPeriodRun?.player_results || [];
      const totalQualified = playerResults.filter((p: any) => p.qualified).length;
      const totalDisqualified = playerResults.filter((p: any) => !p.qualified).length;

      // Calculate reward distributions stats (Min, Max, Avg)
      const rewardsList = playerResults.filter((p: any) => p.qualified && p.final_reward > 0).map((p: any) => Number(p.final_reward));
      const highestReward = rewardsList.length > 0 ? Math.max(...rewardsList) : 0;
      const lowestReward = rewardsList.length > 0 ? Math.min(...rewardsList) : 0;
      const averageReward = rewardsList.length > 0 ? rewardsList.reduce((s, r) => s + r, 0) / rewardsList.length : 0;

      // Pending reviews count (All runs with status Pending Review)
      const pendingReviews = (runs ?? []).filter(r => r.status === "Pending Review").length;
      const completedDistributions = (runs ?? []).filter(r => r.status === "Completed" || r.status === "Locked").length;

      return {
        success: true,
        stats: {
          activeMonth,
          activeYear,
          financials: isSuperAdmin ? {
            monthlyDeposits,
            monthlyCashouts,
            monthlyHolding: monthlyDeposits - monthlyCashouts,
            rewardPool: currentPeriodRun ? Number(currentPeriodRun.reward_pool) : 0,
            totalDistributedRewards: currentPeriodRun ? Number(currentPeriodRun.total_distributed_rewards) : 0,
          } : null,
          playerStats: {
            qualified: totalQualified,
            disqualified: totalDisqualified,
            newPlayers: newPlayersCount,
            totalPlayers: profiles?.length || 0,
          },
          vipStats: {
            bronze: vipCounts.bronze,
            silver: vipCounts.silver,
            gold: vipCounts.gold,
            platinum: vipCounts.platinum,
            diamond: vipCounts.diamond,
            black_diamond: vipCounts.black_diamond,
          },
          rewardStats: {
            highest: Number(highestReward.toFixed(2)),
            lowest: Number(lowestReward.toFixed(2)),
            average: Number(averageReward.toFixed(2)),
          },
          controlsSummary: {
            pendingReviews,
            completedDistributions,
            activeRunStatus: currentPeriodRun?.status || "No Run Scheduled",
            activeRunId: currentPeriodRun?.id || null,
          },
          referralStats,
        },
        chartsData: chartPoints,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

/**
 * Server Function: getUserVipDashboardStats
 * Retrieves user VIP tier, progression tracker, estimated reward details, and referral/wallet summary cards.
 */
export const getUserVipDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // 1. Fetch player profile
      const { data: profile, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("id, username, created_at, vip_status, wallet_balance, credit_balance")
        .eq("id", context.userId)
        .single();

      if (profErr) throw new Error(profErr.message);

      // 2. Fetch sum of user cashins to calculate progression progress
      const { data: txs } = await supabaseAdmin
        .from("wallet_transactions")
        .select("amount")
        .eq("user_id", context.userId)
        .eq("action", "cashin")
        .eq("deleted", false);

      const totalDeposits = (txs ?? []).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

      // 3. progression rules logic
      const vipThresholds = [
        { level: "none", limit: 0, label: "None" },
        { level: "bronze", limit: 100, label: "Bronze" },
        { level: "silver", limit: 250, label: "Silver" },
        { level: "gold", limit: 500, label: "Gold" },
        { level: "platinum", limit: 1000, label: "Platinum" },
        { level: "diamond", limit: 5000, label: "Diamond" },
        { level: "black_diamond", limit: 10000, label: "Black Diamond" },
      ];

      const currentStatus = (profile.vip_status || "none").toLowerCase().replace(/[\s-]+/g, "_");
      let currentTierIdx = vipThresholds.findIndex(t => t.level === currentStatus);
      if (currentTierIdx === -1) currentTierIdx = 0;

      const currentTier = vipThresholds[currentTierIdx];
      const nextTier = currentTierIdx < vipThresholds.length - 1 ? vipThresholds[currentTierIdx + 1] : null;

      let progressPct = 100;
      let remainingDeposits = 0;
      if (nextTier) {
        const tierMin = currentTier.limit;
        const tierMax = nextTier.limit;
        remainingDeposits = Math.max(0, tierMax - totalDeposits);
        progressPct = Math.min(100, Math.max(0, ((totalDeposits - tierMin) / (tierMax - tierMin)) * 100));
      }

      // VIP Benefits descriptions
      const vipBenefits: Record<string, string[]> = {
        none: ["Standard 1.0x score multiplier", "Standard withdrawal speeds"],
        bronze: ["1.05x reward score multiplier boost", "Priority account notifications"],
        silver: ["1.10x reward score multiplier boost", "Priority chat responses", "Special loyalty gifts"],
        gold: ["1.20x reward score multiplier boost", "Dedicated manager assistance", "Fast-tracked cashouts"],
        platinum: ["1.30x reward score multiplier boost", "24/7 personal host access", "Zero fee cashouts"],
        diamond: ["1.50x reward score multiplier boost", "Custom reward plans", "Instant payout support"],
        black_diamond: ["2.00x maximum reward score multiplier", "VIP event invitations", "Bespoke service support"],
      };

      // 4. Referrals progress count
      const { data: referrals } = await supabaseAdmin
        .from("referrals")
        .select("referred_id, status")
        .eq("referrer_id", context.userId);

      const totalReferrals = referrals?.length || 0;
      let qualifiedReferrals = 0;

      // We read active settings for referral minimum threshold
      const reader = new ConfigReaderService();
      const settings = await reader.getActiveSettings(supabaseAdmin);
      const minReferralDeposit = settings?.referral_qualification_rules?.min_referred_deposit ?? 50.0;

      if (referrals && referrals.length > 0) {
        const referredIds = referrals.map(r => r.referred_id);
        
        // Query referred user cashins
        const { data: refDeposits } = await supabaseAdmin
          .from("wallet_transactions")
          .select("user_id, amount")
          .eq("deleted", false)
          .eq("action", "cashin")
          .in("user_id", referredIds);

        const refDepositSums: Record<string, number> = {};
        if (refDeposits) {
          for (const d of refDeposits) {
            if (d.user_id) {
              refDepositSums[d.user_id] = (refDepositSums[d.user_id] || 0) + Number(d.amount);
            }
          }
        }

        qualifiedReferrals = Object.values(refDepositSums).filter(sum => sum >= minReferralDeposit).length;
      }

      // 5. Current Month Live Payout Estimation
      const activeMonth = new Date().getMonth() + 1;
      const activeYear = new Date().getFullYear();

      const { data: activeRun } = await supabaseAdmin
        .from("vip_reward_runs")
        .select("*")
        .eq("month", activeMonth)
        .eq("year", activeYear)
        .maybeSingle();

      let activeMonthEstimate = null;
      if (activeRun && Array.isArray(activeRun.player_results)) {
        const userEst = activeRun.player_results.find((p: any) => p.user_id === context.userId);
        if (userEst) {
          activeMonthEstimate = {
            rewardAmount: Number(userEst.final_reward || 0),
            qualified: userEst.qualified,
            disqualificationReason: userEst.disqualification_reason || null,
            multiplier: Number(userEst.multiplier || 1.0),
            finalScore: Number(userEst.final_score || 0),
            status: activeRun.status,
          };
        }
      }

      return {
        success: true,
        profile: {
          username: profile.username,
          vipStatus: profile.vip_status || "none",
          walletBalance: Number(profile.wallet_balance || 0),
          creditBalance: Number(profile.credit_balance || 0),
        },
        progression: {
          totalDeposits: Number(totalDeposits.toFixed(2)),
          currentTier: currentTier.label,
          nextTier: nextTier ? nextTier.label : "Maximum Tier",
          progressPercentage: Number(progressPct.toFixed(1)),
          remainingDeposits: Number(remainingDeposits.toFixed(2)),
          benefits: vipBenefits[currentStatus] || vipBenefits.none,
        },
        referrals: {
          total: totalReferrals,
          qualified: qualifiedReferrals,
          minRequiredDeposit: minReferralDeposit,
        },
        activeMonthEstimate,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

/**
 * Server Function: getVipReportsData
 * Fetches tabular rows formatted specifically for generating the 5 executive reports.
 */
export const getVipReportsData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(getReportsValidator)
  .handler(async ({ data, context }) => {
    try {
      await assertAdmin(context.supabase, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const month = data.month ?? new Date().getMonth() + 1;
      const year = data.year ?? new Date().getFullYear();

      if (data.type === "monthly_reward") {
        // Fetch summary of all runs
        const { data: runs, error } = await supabaseAdmin
          .from("vip_reward_runs")
          .select("*")
          .order("year", { ascending: false })
          .order("month", { ascending: false });

        if (error) throw new Error(error.message);

        return {
          success: true,
          reportName: "VIP Monthly Reward Report",
          headers: ["Month", "Year", "Status", "Reward Pool", "Qualified Players", "Distributed Amount", "Created At"],
          rows: (runs ?? []).map((r: any) => {
            const mName = new Date(0, r.month - 1).toLocaleString("en", { month: "long" });
            return [
              mName,
              r.year,
              r.status,
              `$${Number(r.reward_pool).toFixed(2)}`,
              r.total_qualified_users,
              `$${Number(r.total_distributed_rewards).toFixed(2)}`,
              new Date(r.created_at).toLocaleDateString(),
            ];
          }),
        };
      }

      else if (data.type === "vip") {
        // Fetch active VIP user profiles
        let query = supabaseAdmin
          .from("profiles")
          .select("username, vip_status, wallet_balance, credit_balance, created_at");

        if (data.vipStatus && data.vipStatus !== "all") {
          query = query.eq("vip_status", data.vipStatus);
        } else {
          query = query.neq("vip_status", "none");
        }

        const { data: users, error } = await query;
        if (error) throw new Error(error.message);

        return {
          success: true,
          reportName: `VIP Status Tiers Report (${data.vipStatus || "All VIP"})`,
          headers: ["Username", "VIP Status", "Wallet Balance", "Credit Balance", "Joined Date"],
          rows: (users ?? []).map((u: any) => [
            u.username,
            (u.vip_status || "None").toUpperCase(),
            `$${Number(u.wallet_balance || 0).toFixed(2)}`,
            `$${Number(u.credit_balance || 0).toFixed(2)}`,
            new Date(u.created_at).toLocaleDateString(),
          ]),
        };
      }

      else if (data.type === "referral") {
        // Referral conversions report
        const { data: refs, error } = await supabaseAdmin
          .from("referrals")
          .select("*, referrer:referrer_id(username), referred:referred_id(username, created_at)");

        if (error) throw new Error(error.message);

        // Group referred users by referrer to compile statistics
        const referrerMap: Record<string, { username: string; total: number; joined: number; pending: number }> = {};
        for (const ref of (refs ?? [])) {
          const rName = ref.referrer?.username || "Unknown Referrer";
          if (!referrerMap[rName]) {
            referrerMap[rName] = { username: rName, total: 0, joined: 0, pending: 0 };
          }
          referrerMap[rName].total++;
          if (ref.status === "joined") referrerMap[rName].joined++;
          else referrerMap[rName].pending++;
        }

        return {
          success: true,
          reportName: "Referrals Stats Overview Report",
          headers: ["Referrer Username", "Total Referrals Count", "Joined Referrals", "Pending Invites"],
          rows: Object.values(referrerMap).map((r) => [
            r.username,
            r.total,
            r.joined,
            r.pending,
          ]),
        };
      }

      else if (data.type === "distribution") {
        // Distribution payouts transactions log
        const { data: run } = await supabaseAdmin
          .from("vip_reward_runs")
          .select("*")
          .eq("month", month)
          .eq("year", year)
          .maybeSingle();

        const results = run?.player_results || [];
        const payouts = results.filter((p: any) => p.qualified && p.final_reward > 0);

        return {
          success: true,
          reportName: `VIP Rewards Distributions Report (${month}/${year})`,
          headers: ["Username", "VIP Rank", "Base Score", "Multiplier", "Final Score", "Payout Amount", "Status"],
          rows: payouts.map((p: any) => [
            p.username,
            (p.vip_status || "none").toUpperCase(),
            Number(p.base_score || 0).toFixed(2),
            `${Number(p.multiplier || 1).toFixed(2)}x`,
            `${Number(p.final_score || 0).toFixed(4)}%`,
            `$${Number(p.final_reward || 0).toFixed(2)}`,
            run?.status || "Draft",
          ]),
        };
      }

      else if (data.type === "qualification") {
        // Qualification analysis lists (including disqualify reasons)
        const { data: run } = await supabaseAdmin
          .from("vip_reward_runs")
          .select("*")
          .eq("month", month)
          .eq("year", year)
          .maybeSingle();

        const results = run?.player_results || [];

        return {
          success: true,
          reportName: `VIP Players Qualification Report (${month}/${year})`,
          headers: ["Username", "Status", "Monthly Deposits", "Monthly Holding", "Qualification Status", "Disqualification Reason"],
          rows: results.map((p: any) => [
            p.username,
            (p.vip_status || "none").toUpperCase(),
            `$${Number(p.monthly_deposit || 0).toFixed(2)}`,
            `$${Number(p.monthly_holding || 0).toFixed(2)}`,
            p.qualified ? "QUALIFIED" : "DISQUALIFIED",
            p.disqualification_reason || "N/A",
          ]),
        };
      }

      throw new Error("Invalid report type specified.");
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
