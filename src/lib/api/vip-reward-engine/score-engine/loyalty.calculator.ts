import { UserActivity } from "../types";

export interface LoyaltyRuleConfig {
  verified_account_points: number;
  consecutive_months_multiplier: number;
  active_days_multiplier: number;
  campaign_participation_points: number;
}

export class LoyaltyCalculator {
  // Configurable rules fallback defaults
  private readonly defaultConfig: LoyaltyRuleConfig = {
    verified_account_points: 30,
    consecutive_months_multiplier: 10,
    active_days_multiplier: 2,
    campaign_participation_points: 10,
  };

  /**
   * Calculates the Loyalty Score for qualified players proportionally compared to the group.
   * @param qualifiedActivities Activity records of only the qualified players
   * @param extraContext Map containing extra parameters (verified profiles list, active login days count per user)
   * @param rulesConfig Pluggable dynamic rules configuration
   */
  calculateScores(
    qualifiedActivities: UserActivity[],
    extraContext: {
      verifiedUserIds: Set<string>;
      activeDaysMap: Record<string, number>;
      campaignUserIds?: Set<string>;
    },
    rulesConfig?: Partial<LoyaltyRuleConfig>
  ): Record<string, number> {
    const config = { ...this.defaultConfig, ...rulesConfig };
    const rawScores: Record<string, number> = {};
    const scores: Record<string, number> = {};

    let totalRawScore = 0;

    for (const act of qualifiedActivities) {
      let rawScore = 0;

      // 1. Verified account rule
      if (extraContext.verifiedUserIds.has(act.user_id)) {
        rawScore += config.verified_account_points;
      }

      // 2. Loyalty consecutive qualified months rule
      rawScore += act.loyalty_months * config.consecutive_months_multiplier;

      // 3. Active login days rule
      const activeDays = extraContext.activeDaysMap[act.user_id] || 0;
      rawScore += activeDays * config.active_days_multiplier;

      // 4. Campaign participation rule
      if (extraContext.campaignUserIds?.has(act.user_id)) {
        rawScore += config.campaign_participation_points;
      }

      // Clamp raw score to positive bounds
      const safeRawScore = Math.max(0, rawScore);
      rawScores[act.user_id] = safeRawScore;
      totalRawScore += safeRawScore;
    }

    // Scale raw scores proportionally to ensure component sum is exactly 100
    for (const act of qualifiedActivities) {
      if (totalRawScore > 0) {
        scores[act.user_id] = (rawScores[act.user_id] / totalRawScore) * 100;
      } else {
        scores[act.user_id] = 0;
      }
    }

    return scores;
  }
}
