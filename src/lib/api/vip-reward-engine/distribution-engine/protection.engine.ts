export interface UserPayoutCalc {
  userId: string;
  finalScore: number;
  initialPayout: number;
  capApplied: boolean;
  finalPayout: number;
}

export class RewardProtectionEngine {
  /**
   * Calculates player payouts iteratively while enforcing configured reward pool caps.
   * Excess payouts are redistributed proportionally among remaining uncapped players.
   */
  calculatePayouts(
    users: Array<{ userId: string; finalScore: number }>,
    rewardPool: number,
    rewardCapPercentage: number
  ): UserPayoutCalc[] {
    if (users.length === 0 || rewardPool <= 0) {
      return users.map(u => ({
        userId: u.userId,
        finalScore: u.finalScore,
        initialPayout: 0,
        capApplied: false,
        finalPayout: 0,
      }));
    }

    const totalFinalScore = users.reduce((sum, u) => sum + u.finalScore, 0);
    const maxCap = rewardPool * (rewardCapPercentage / 100);

    // 1. Compute initial proportional payouts
    const payouts: UserPayoutCalc[] = users.map(u => {
      const initialPayout = totalFinalScore > 0 ? rewardPool * (u.finalScore / totalFinalScore) : 0;
      return {
        userId: u.userId,
        finalScore: u.finalScore,
        initialPayout,
        capApplied: false,
        finalPayout: initialPayout,
      };
    });

    // 2. Iterative Capping and Redistribution loop
    let changed = true;
    const cappedUserIds = new Set<string>();

    while (changed) {
      changed = false;
      let excessPool = 0;

      // Find newly capped users and harvest excess
      for (const p of payouts) {
        if (!cappedUserIds.has(p.userId) && p.finalPayout > maxCap) {
          excessPool += p.finalPayout - maxCap;
          p.finalPayout = maxCap;
          p.capApplied = true;
          cappedUserIds.add(p.userId);
          changed = true;
        }
      }

      // If we have excess to distribute, split it proportionally among remaining uncapped users
      if (excessPool > 0) {
        const remainingUsers = payouts.filter(p => !cappedUserIds.has(p.userId));
        const remainingScoreSum = remainingUsers.reduce((sum, u) => sum + u.finalScore, 0);

        if (remainingScoreSum > 0 && remainingUsers.length > 0) {
          for (const p of remainingUsers) {
            const addedShare = excessPool * (p.finalScore / remainingScoreSum);
            p.finalPayout += addedShare;
          }
        } else {
          // Fallback: if all active players are capped, distribute remaining excess pool proportionally among all players
          const totalScoreSum = payouts.reduce((sum, u) => sum + u.finalScore, 0);
          if (totalScoreSum > 0) {
            for (const p of payouts) {
              const addedShare = excessPool * (p.finalScore / totalScoreSum);
              p.finalPayout += addedShare;
            }
          }
          break;
        }
      }
    }

    // 3. Format to 2 decimal places and handle penny adjustments to keep pool preserved
    let distributedSum = 0;
    payouts.forEach(p => {
      // Ensure no negative rewards are ever possible
      p.finalPayout = Math.max(0, p.finalPayout);
      // Round to 2 decimal places
      p.finalPayout = Number(p.finalPayout.toFixed(2));
      distributedSum += p.finalPayout;
    });

    // Adjust for minor rounding differences on the largest uncapped payout (or first user if all capped)
    const diff = Number((rewardPool - distributedSum).toFixed(2));
    if (diff !== 0 && payouts.length > 0) {
      // Sort to find eligible user for rounding adjustment (preferably uncapped)
      const targetUser = payouts.find(p => !p.capApplied) || payouts[0];
      if (targetUser) {
        targetUser.finalPayout = Number((targetUser.finalPayout + diff).toFixed(2));
      }
    }

    return payouts;
  }
}
