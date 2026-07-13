import { SupabaseClient } from "@supabase/supabase-js";
import { ConfigReaderService } from "./config-reader.service";
import { ValidationService } from "./validation.service";
import { EngineParams, RewardResult, SimulationResult, UserActivity } from "./types";

export class VipRewardEngineService {
  private configReader = new ConfigReaderService();
  private validator = new ValidationService();

  /**
   * Runs the VIP monthly loyalty reward engine calculation simulation.
   */
  async runSimulation(supabase: SupabaseClient, params: EngineParams): Promise<SimulationResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    
    logs.push(`[VipRewardEngine] Starting engine execution run for ${params.month}/${params.year}.`);
    logs.push(`[VipRewardEngine] Simulation Mode: ${params.isSimulation}`);

    try {
      // 1. Validate input params
      const paramErrors = this.validator.validateParams(params);
      if (paramErrors.length > 0) {
        logs.push(`[VipRewardEngine] Input parameter validation failed.`);
        return {
          status: "error",
          error_message: `Invalid parameters: ${paramErrors.join(" | ")}`,
          execution_time_ms: Date.now() - startTime,
          month: params.month,
          year: params.year,
          is_simulation: params.isSimulation,
          pool_size: 0,
          total_qualified_users: 0,
          total_distributed_rewards: 0,
          configuration: null,
          user_results: [],
          logs
        };
      }

      // 2. Load Configuration Settings
      logs.push(`[VipRewardEngine] Loading configuration settings from database.`);
      const settings = await this.configReader.getActiveSettings(supabase);
      if (!settings) {
        logs.push(`[VipRewardEngine] Missing VIP settings configuration.`);
        return {
          status: "error",
          error_message: "Failed to load settings: Could not find the table or configuration row in database.",
          execution_time_ms: Date.now() - startTime,
          month: params.month,
          year: params.year,
          is_simulation: params.isSimulation,
          pool_size: 0,
          total_qualified_users: 0,
          total_distributed_rewards: 0,
          configuration: null,
          user_results: [],
          logs
        };
      }

      // 3. Validate settings configuration
      const configErrors = this.validator.validateSettings(settings);
      if (configErrors.length > 0) {
        logs.push(`[VipRewardEngine] Configuration validation failed.`);
        return {
          status: "error",
          error_message: `Invalid configuration settings: ${configErrors.join(" | ")}`,
          execution_time_ms: Date.now() - startTime,
          month: params.month,
          year: params.year,
          is_simulation: params.isSimulation,
          pool_size: 0,
          total_qualified_users: 0,
          total_distributed_rewards: 0,
          configuration: settings,
          user_results: [],
          logs
        };
      }
      logs.push(`[VipRewardEngine] Configuration settings verified successfully.`);

      // Enforce strict constraint: We do NOT allow non-simulation runs in this phase!
      if (!params.isSimulation) {
        throw new Error("Action Forbidden: Non-simulation execution is not supported in this phase.");
      }

      // 4. Retrieve candidate users from database profiles
      logs.push(`[VipRewardEngine] Fetching candidate profiles from database.`);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, username, vip_status, wallet_balance, is_blocked, verified, status")
        .eq("is_blocked", false);

      if (profilesError) {
        throw new Error(`Failed to load candidates: ${profilesError.message}`);
      }

      const candidates = profiles ?? [];
      logs.push(`[VipRewardEngine] Found ${candidates.length} candidate user profiles.`);

      // Define date range for transactions query
      const startDate = new Date(Date.UTC(params.year, params.month - 1, 1)).toISOString();
      const endDate = new Date(Date.UTC(params.year, params.month, 1, 0, 0, 0, -1)).toISOString();
      logs.push(`[VipRewardEngine] Querying transactions from ${startDate} to ${endDate}.`);

      // Query monthly transactions in range
      const { data: txs, error: txsError } = await supabase
        .from("wallet_transactions")
        .select("user_id, action, amount, created_at")
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .in("action", ["cashin", "cashout"]);

      if (txsError) {
        throw new Error(`Failed to query transactions: ${txsError.message}`);
      }

      const transactions = txs ?? [];
      logs.push(`[VipRewardEngine] Retrieved ${transactions.length} wallet transactions for the period.`);

      // Group transactions by user_id
      const depositsMap: Record<string, number> = {};
      const cashoutsMap: Record<string, number> = {};

      for (const tx of transactions) {
        if (!tx.user_id) continue;
        const amt = Number(tx.amount || 0);
        if (tx.action === "cashin") {
          depositsMap[tx.user_id] = (depositsMap[tx.user_id] || 0) + amt;
        } else if (tx.action === "cashout") {
          cashoutsMap[tx.user_id] = (cashoutsMap[tx.user_id] || 0) + amt;
        }
      }

      // Fetch referrals to implement referral qualifications checks (if rules are active)
      logs.push(`[VipRewardEngine] Fetching referrals for eligibility verification.`);
      const { data: referrals, error: referralsError } = await supabase
        .from("referrals")
        .select("referrer_id, referred_id, status");

      if (referralsError) {
        throw new Error(`Failed to query referrals: ${referralsError.message}`);
      }

      const referralsList = referrals ?? [];
      const referrerMap: Record<string, string[]> = {};
      for (const ref of referralsList) {
        if (ref.referrer_id && ref.referred_id) {
          if (!referrerMap[ref.referrer_id]) {
            referrerMap[ref.referrer_id] = [];
          }
          referrerMap[ref.referrer_id].push(ref.referred_id);
        }
      }

      // Calculate monthly holding and qualification status for each candidate user
      const userActivities: UserActivity[] = [];

      for (const c of candidates) {
        const monthlyDeposit = depositsMap[c.id] || 0.0;
        const monthlyCashout = cashoutsMap[c.id] || 0.0;
        const monthlyHolding = monthlyDeposit - monthlyCashout;

        // Count qualified referrals
        const referredIds = referrerMap[c.id] || [];
        let referralCount = 0;
        let referredDepositTotal = 0;

        for (const refId of referredIds) {
          const refDeposit = depositsMap[refId] || 0;
          referredDepositTotal += refDeposit;
          
          if (refDeposit >= settings.referral_qualification_rules.min_referred_deposit) {
            if (settings.referral_qualification_rules.requires_verification) {
              const referredProfile = candidates.find(u => u.id === refId);
              if (referredProfile?.verified) {
                referralCount++;
              }
            } else {
              referralCount++;
            }
          }
        }

        userActivities.push({
          user_id: c.id,
          email: c.email || "",
          username: c.username || "User",
          vip_status: c.vip_status || "none",
          monthly_deposit: monthlyDeposit,
          monthly_cashout: monthlyCashout,
          monthly_holding: monthlyHolding,
          referred_deposit_total: referredDepositTotal,
          referral_count: referralCount,
          loyalty_months: 1,
        });
      }

      let totalQualifiedHolding = 0;
      const userResults: RewardResult[] = [];
      let totalQualifiedUsers = 0;

      // Evaluate player qualification
      for (const act of userActivities) {
        let qualified = true;
        let disqualificationReason: string | null = null;

        const candidateProfile = candidates.find(u => u.id === act.user_id);
        if (!candidateProfile || candidateProfile.is_blocked) {
          qualified = false;
          disqualificationReason = "Account is blocked or suspended";
        }
        else if (act.monthly_deposit < settings.min_monthly_deposit) {
          qualified = false;
          disqualificationReason = `Deposits below minimum requirement ($${act.monthly_deposit.toFixed(2)} < $${settings.min_monthly_deposit.toFixed(2)})`;
        }
        else if (act.monthly_holding <= 0) {
          qualified = false;
          disqualificationReason = `Non-positive holding contribution ($${act.monthly_holding.toFixed(2)} <= 0)`;
        }
        else if (act.monthly_holding < settings.min_holding_requirement) {
          qualified = false;
          disqualificationReason = `Holding below minimum requirement ($${act.monthly_holding.toFixed(2)} < $${settings.min_holding_requirement.toFixed(2)})`;
        }

        if (qualified) {
          totalQualifiedUsers++;
          totalQualifiedHolding += act.monthly_holding;
        }

        userResults.push({
          user_id: act.user_id,
          email: act.email,
          username: act.username,
          vip_status: act.vip_status,
          monthly_deposit: act.monthly_deposit,
          monthly_cashout: act.monthly_cashout,
          monthly_holding: act.monthly_holding,
          deposit_score: qualified ? 100 : 0,
          holding_score: qualified ? 100 : 0,
          referral_score: qualified ? 100 : 0,
          loyalty_score: qualified ? 100 : 0,
          base_score: qualified ? 100 : 0,
          multiplier: 1.0,
          final_score: qualified ? 100 : 0,
          qualified,
          disqualification_reason: disqualificationReason,
          estimated_payout: 0,
        });
      }

      // Calculate total pool size
      let totalPoolSize = totalQualifiedHolding * (settings.reward_pool_percentage / 100);
      if (totalPoolSize < 0) {
        totalPoolSize = 0;
      }
      logs.push(`[VipRewardEngine] Total Qualified Holding sum: $${totalQualifiedHolding.toFixed(2)}.`);
      logs.push(`[VipRewardEngine] Allocated Reward Pool: $${totalPoolSize.toFixed(2)} (${settings.reward_pool_percentage}%).`);

      let totalDistributedRewards = 0;
      if (totalQualifiedUsers > 0) {
        const individualPayout = totalPoolSize / totalQualifiedUsers;
        for (const res of userResults) {
          if (!res.qualified) continue;
          
          let payout = individualPayout;
          const maxPayoutCap = totalPoolSize * (settings.reward_cap_percentage / 100);
          if (payout > maxPayoutCap) {
            payout = maxPayoutCap;
          }
          res.estimated_payout = Number(payout.toFixed(2));
          totalDistributedRewards += res.estimated_payout;
        }
      }

      logs.push(`[VipRewardEngine] Calculation simulation completed successfully.`);
      logs.push(`[VipRewardEngine] Qualified Users: ${totalQualifiedUsers}/${userResults.length}.`);
      logs.push(`[VipRewardEngine] Total Distributed Rewards: $${totalDistributedRewards.toFixed(2)}.`);

      return {
        status: "success",
        execution_time_ms: Date.now() - startTime,
        month: params.month,
        year: params.year,
        is_simulation: params.isSimulation,
        pool_size: Number(totalPoolSize.toFixed(2)),
        total_qualified_users: totalQualifiedUsers,
        total_distributed_rewards: Number(totalDistributedRewards.toFixed(2)),
        configuration: settings,
        user_results: userResults,
        logs
      };

    } catch (e: any) {
      logs.push(`[VipRewardEngine] Engine crashed with exception: ${e.message}`);
      console.error("[VipRewardEngine Crash]:", e);
      return {
        status: "error",
        error_message: e.message || "An unexpected error occurred during execution.",
        execution_time_ms: Date.now() - startTime,
        month: params.month,
        year: params.year,
        is_simulation: params.isSimulation,
        pool_size: 0,
        total_qualified_users: 0,
        total_distributed_rewards: 0,
        configuration: null,
        user_results: [],
        logs
      };
    }
  }
}
