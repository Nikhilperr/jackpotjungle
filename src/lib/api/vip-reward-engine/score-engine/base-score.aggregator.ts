import { VipRewardSettings } from "../types";

export class BaseScoreAggregator {
  /**
   * Aggregates component scores into a single weighted Base Score for each qualified player.
   * Base Score = (Deposit Score * Deposit Weight + Holding Score * Holding Weight + Referral Score * Referral Weight + Loyalty Score * Loyalty Weight) / 100
   */
  aggregate(
    userIds: string[],
    depositScores: Record<string, number>,
    holdingScores: Record<string, number>,
    referralScores: Record<string, number>,
    loyaltyScores: Record<string, number>,
    settings: VipRewardSettings
  ): Record<string, number> {
    const baseScores: Record<string, number> = {};

    const wDep = settings.deposit_weight;
    const wHold = settings.holding_weight;
    const wRef = settings.referral_weight;
    const wLoy = settings.loyalty_weight;

    for (const id of userIds) {
      const depScore = depositScores[id] || 0;
      const holdScore = holdingScores[id] || 0;
      const refScore = referralScores[id] || 0;
      const loyScore = loyaltyScores[id] || 0;

      const baseScore =
        (depScore * wDep +
          holdScore * wHold +
          refScore * wRef +
          loyScore * wLoy) /
        100;

      baseScores[id] = Number(baseScore.toFixed(4));
    }

    return baseScores;
  }
}
