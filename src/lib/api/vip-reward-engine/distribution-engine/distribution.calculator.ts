import { DistributionValidator } from "./distribution.validator";
import { RewardProtectionEngine, UserPayoutCalc } from "./protection.engine";
import { VipRewardSettings } from "../types";

export interface PayoutDistributionOutput {
  payouts: Record<string, {
    rewardBeforeProtection: number;
    capApplied: boolean;
    finalReward: number;
  }>;
  totalDistributed: number;
}

export class DistributionCalculator {
  private validator = new DistributionValidator();
  private protectionEngine = new RewardProtectionEngine();

  /**
   * Calculates reward payouts with validation and cap protection.
   * Throws Error if validation checks fail.
   */
  calculate(
    qualifiedPlayers: Array<{ userId: string; finalScore: number }>,
    rewardPool: number,
    settings: VipRewardSettings
  ): PayoutDistributionOutput {
    const totalFinalScores = qualifiedPlayers.reduce((sum, p) => sum + p.finalScore, 0);

    // 1. Run prerequisite distribution validation checks
    const validationErrors = this.validator.validate(
      rewardPool,
      totalFinalScores,
      qualifiedPlayers.length
    );

    if (validationErrors.length > 0) {
      throw new Error(`Distribution Validation Failed:\n${validationErrors.join("\n")}`);
    }

    if (qualifiedPlayers.length === 0 || rewardPool <= 0) {
      return { payouts: {}, totalDistributed: 0 };
    }

    // 2. Execute capped reward protection and redistribution logic
    const protectionResults = this.protectionEngine.calculatePayouts(
      qualifiedPlayers,
      rewardPool,
      settings.reward_cap_percentage
    );

    // 3. Map results to structured output record
    const payouts: Record<string, {
      rewardBeforeProtection: number;
      capApplied: boolean;
      finalReward: number;
    }> = {};

    let totalDistributed = 0;

    for (const res of protectionResults) {
      payouts[res.userId] = {
        rewardBeforeProtection: Number(res.initialPayout.toFixed(4)),
        capApplied: res.capApplied,
        finalReward: res.finalPayout,
      };
      totalDistributed += res.finalPayout;
    }

    return {
      payouts,
      totalDistributed: Number(totalDistributed.toFixed(2)),
    };
  }
}
