import { VipRewardSettings } from "../types";

export class MultiplierLookupService {
  /**
   * Resolves the VIP multiplier from settings for a normalized VIP level.
   * If level is not configured, or is invalid, falls back safely to 1.0.
   */
  resolveMultiplier(normalizedStatus: string, settings: VipRewardSettings): number {
    if (!settings || !settings.vip_multipliers) {
      return 1.0;
    }

    // Dynamic property access to support new/future levels
    const multipliers = settings.vip_multipliers as Record<string, any>;
    const multiplierVal = multipliers[normalizedStatus];

    if (multiplierVal === undefined || multiplierVal === null) {
      return 1.0;
    }

    const numericVal = Number(multiplierVal);
    
    // Validate multiplier is a non-negative number
    if (isNaN(numericVal) || numericVal < 0) {
      throw new Error(`Invalid configuration: Multiplier for VIP level "${normalizedStatus}" must be a non-negative number.`);
    }

    return numericVal;
  }
}
