import { VipLookupService } from "./vip-lookup.service";
import { MultiplierLookupService } from "./multiplier-lookup.service";
import { VipRewardSettings } from "../types";

export class MultiplierCalculator {
  private vipLookup = new VipLookupService();
  private multiplierLookup = new MultiplierLookupService();

  /**
   * Applies VIP Multiplier to qualified player base score to compute final adjusted score.
   */
  calculateFinalScore(
    baseScore: number,
    vipStatus: string | null | undefined,
    settings: VipRewardSettings
  ): { finalScore: number; multiplier: number; normalizedVip: string } {
    const normalizedVip = this.vipLookup.normalizeStatus(vipStatus);
    
    // Resolve the multiplier value from configuration settings
    const multiplier = this.multiplierLookup.resolveMultiplier(normalizedVip, settings);
    
    // Calculate Final Adjusted Score: Final Score = Base Score * VIP Multiplier
    const finalScore = baseScore * multiplier;
    
    return {
      finalScore,
      multiplier,
      normalizedVip,
    };
  }
}
