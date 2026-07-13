import { UserActivity } from "../types";

export class HoldingCalculator {
  /**
   * Calculates the Holding Score for qualified players proportionally compared to the group.
   * @param qualifiedActivities Activity records of only the qualified players
   */
  calculateScores(qualifiedActivities: UserActivity[]): Record<string, number> {
    const scores: Record<string, number> = {};
    
    // Sum total positive holdings among qualified players
    const totalHolding = qualifiedActivities.reduce((sum, act) => sum + Math.max(0, act.monthly_holding), 0);
    
    for (const act of qualifiedActivities) {
      if (totalHolding > 0) {
        // Proportional contribution score
        scores[act.user_id] = (Math.max(0, act.monthly_holding) / totalHolding) * 100;
      } else {
        scores[act.user_id] = 0;
      }
    }
    
    return scores;
  }
}
