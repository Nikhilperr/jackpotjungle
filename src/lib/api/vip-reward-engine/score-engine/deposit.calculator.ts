import { UserActivity } from "../types";

export class DepositCalculator {
  /**
   * Calculates the Deposit Score for qualified players proportionally compared to the group.
   * @param qualifiedActivities Activity records of only the qualified players
   */
  calculateScores(qualifiedActivities: UserActivity[]): Record<string, number> {
    const scores: Record<string, number> = {};
    
    // Sum total deposits among all qualified players
    const totalDeposits = qualifiedActivities.reduce((sum, act) => sum + Math.max(0, act.monthly_deposit), 0);
    
    for (const act of qualifiedActivities) {
      if (totalDeposits > 0) {
        // Proportional contribution score
        scores[act.user_id] = (Math.max(0, act.monthly_deposit) / totalDeposits) * 100;
      } else {
        scores[act.user_id] = 0;
      }
    }
    
    return scores;
  }
}
