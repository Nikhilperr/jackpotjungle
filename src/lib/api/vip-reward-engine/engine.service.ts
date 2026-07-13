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
        .select("id, email, username, vip_status, wallet_balance")
        .eq("is_blocked", false)
        .limit(100); // Process batch in this foundation phase

      if (profilesError) {
        throw new Error(`Failed to load candidates: ${profilesError.message}`);
      }

      const candidates = profiles ?? [];
      logs.push(`[VipRewardEngine] Found ${candidates.length} candidate user profiles.`);

      // 5. Gather/Mock activity metrics for calculation context foundation
      // (Actual activity aggregation metrics will be integrated in Phase 3/4)
      const userActivities: UserActivity[] = candidates.map(c => {
        // Safe baseline mock values mapped from user profile values
        const monthlyDeposit = c.wallet_balance > 0 ? Number((c.wallet_balance * 1.5).toFixed(2)) : 150.0;
        const monthlyHolding = Number((c.wallet_balance).toFixed(2));
        
        return {
          user_id: c.id,
          email: c.email || "",
          username: c.username || "User",
          vip_status: c.vip_status || "none",
          monthly_deposit: monthlyDeposit,
          monthly_holding: monthlyHolding,
          referred_deposit_total: 120.0,
          referral_count: 2,
          loyalty_months: 6,
        };
      });

      // Define static virtual monthly holding pool for simulator payout estimation
      const absoluteMonthlyHolding = userActivities.reduce((acc, curr) => acc + curr.monthly_holding, 0) || 50000.0;
      const totalPoolSize = absoluteMonthlyHolding * (settings.reward_pool_percentage / 100);
      logs.push(`[VipRewardEngine] Monthly Holding Pool calculated: $${absoluteMonthlyHolding.toFixed(2)}.`);
      logs.push(`[VipRewardEngine] Allocated Reward Pool: $${totalPoolSize.toFixed(2)} (${settings.reward_pool_percentage}%).`);

      const userResults: RewardResult[] = [];
      let totalQualifiedUsers = 0;
      let totalCalculatedScores = 0;

      // 6. Perform Qualification and Score Math simulation context mapping
      for (const act of userActivities) {
        // Player Qualification check
        let qualified = true;
        let disqualificationReason: string | null = null;

        if (act.monthly_deposit < settings.min_monthly_deposit) {
          qualified = false;
          disqualificationReason = `Deposit below limit ($${act.monthly_deposit} < $${settings.min_monthly_deposit})`;
        } else if (act.monthly_holding < settings.min_holding_requirement) {
          qualified = false;
          disqualificationReason = `Holding balance below limit ($${act.monthly_holding} < $${settings.min_holding_requirement})`;
        }

        // Subscores mapping placeholder architecture
        const depositScore = act.monthly_deposit >= settings.min_monthly_deposit ? 85 : 0;
        const holdingScore = act.monthly_holding >= settings.min_holding_requirement ? 90 : 0;
        const referralScore = act.referral_count > 0 ? 95 : 0;
        const loyaltyScore = act.loyalty_months * 10 > 100 ? 100 : act.loyalty_months * 10;

        // Base Score = Weighted sum of subscores
        const baseScore = qualified 
          ? (
              (depositScore * settings.deposit_weight) +
              (holdingScore * settings.holding_weight) +
              (referralScore * settings.referral_weight) +
              (loyaltyScore * settings.loyalty_weight)
            ) / 100
          : 0;

        // VIP Multiplier resolution
        let multiplier = 1.0;
        const normalizedStatus = act.vip_status.toLowerCase();
        if (normalizedStatus === "bronze") multiplier = settings.vip_multipliers.bronze;
        else if (normalizedStatus === "silver") multiplier = settings.vip_multipliers.silver;
        else if (normalizedStatus === "gold") multiplier = settings.vip_multipliers.gold;
        else if (normalizedStatus === "platinum") multiplier = settings.vip_multipliers.platinum;
        else if (normalizedStatus === "diamond") multiplier = settings.vip_multipliers.diamond;
        else if (normalizedStatus === "black_diamond" || normalizedStatus === "black diamond") {
          multiplier = settings.vip_multipliers.black_diamond;
        }

        const finalScore = baseScore * multiplier;

        if (qualified) {
          totalQualifiedUsers++;
          totalCalculatedScores += finalScore;
        }

        userResults.push({
          user_id: act.user_id,
          email: act.email,
          username: act.username,
          vip_status: act.vip_status,
          monthly_deposit: act.monthly_deposit,
          monthly_holding: act.monthly_holding,
          deposit_score: depositScore,
          holding_score: holdingScore,
          referral_score: referralScore,
          loyalty_score: loyaltyScore,
          base_score: Number(baseScore.toFixed(2)),
          multiplier,
          final_score: Number(finalScore.toFixed(2)),
          qualified,
          disqualification_reason: disqualificationReason,
          estimated_payout: 0, // Calculated post-loop
        });
      }

      // 7. Share Pool Allocation & Payout Cap validation checks
      let totalDistributedRewards = 0;
      if (totalCalculatedScores > 0) {
        for (const res of userResults) {
          if (!res.qualified) continue;

          // Estimate uncapped reward pool share
          let estimatedShare = totalPoolSize * (res.final_score / totalCalculatedScores);

          // Payout Cap constraint validation
          const maxPayoutCap = totalPoolSize * (settings.reward_cap_percentage / 100);
          if (estimatedShare > maxPayoutCap) {
            estimatedShare = maxPayoutCap;
          }

          res.estimated_payout = Number(estimatedShare.toFixed(2));
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
