export class DistributionValidator {
  /**
   * Validates distribution prerequisites.
   * Returns validation errors array if check fails, or empty array if passed.
   */
  validate(rewardPool: number, totalFinalScores: number, qualifiedUsersCount: number): string[] {
    const errors: string[] = [];

    if (isNaN(rewardPool)) {
      errors.push("Invalid Payout Configuration: Reward Pool is not a valid number.");
    } else if (rewardPool < 0) {
      errors.push(`Invalid Payout Configuration: Reward Pool cannot be negative ($${rewardPool.toFixed(2)}).`);
    }

    if (qualifiedUsersCount > 0) {
      if (isNaN(totalFinalScores)) {
        errors.push("Invalid Scores: Total Final Score is not a valid number.");
      } else if (totalFinalScores <= 0) {
        errors.push(`Invalid Scores: Total Final Score of qualified users must be greater than zero (Received: ${totalFinalScores}).`);
      }
    }

    return errors;
  }
}
