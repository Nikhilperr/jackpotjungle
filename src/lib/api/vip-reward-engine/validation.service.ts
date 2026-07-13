import { VipRewardSettings, EngineParams } from "./types";

export class ValidationService {
  /**
   * Validates VIP settings configuration parameters.
   * Returns list of validation error messages. An empty list implies validation succeeded.
   */
  validateSettings(settings: VipRewardSettings): string[] {
    const errors: string[] = [];

    // 1. Reward Pool Percentage
    if (settings.reward_pool_percentage < 0 || settings.reward_pool_percentage > 100) {
      errors.push(`Reward Pool Percentage must be between 0% and 100% (got ${settings.reward_pool_percentage}%).`);
    }

    // 2. Reward Cap Percentage
    if (settings.reward_cap_percentage < 0 || settings.reward_cap_percentage > 100) {
      errors.push(`Reward Cap Percentage must be between 0% and 100% (got ${settings.reward_cap_percentage}%).`);
    }

    // 3. Weight validations
    if (settings.deposit_weight < 0) errors.push("Deposit weight cannot be negative.");
    if (settings.holding_weight < 0) errors.push("Holding weight cannot be negative.");
    if (settings.referral_weight < 0) errors.push("Referral weight cannot be negative.");
    if (settings.loyalty_weight < 0) errors.push("Loyalty weight cannot be negative.");

    const totalWeight =
      settings.deposit_weight +
      settings.holding_weight +
      settings.referral_weight +
      settings.loyalty_weight;

    if (Math.abs(totalWeight - 100) > 0.001) {
      errors.push(`Score weights must sum to exactly 100 (current sum: ${totalWeight}).`);
    }

    // 4. Threshold validations
    if (settings.min_monthly_deposit < 0) {
      errors.push("Minimum monthly deposit requirement cannot be negative.");
    }
    if (settings.min_holding_requirement < 0) {
      errors.push("Minimum monthly holding requirement cannot be negative.");
    }

    // 5. Distribution Date
    if (settings.distribution_date < 1 || settings.distribution_date > 28) {
      errors.push(`Distribution Date must be between 1 and 28 (got ${settings.distribution_date}).`);
    }

    // 6. Multipliers validations
    const m = settings.vip_multipliers;
    if (m.bronze < 0) errors.push("Bronze multiplier cannot be negative.");
    if (m.silver < 0) errors.push("Silver multiplier cannot be negative.");
    if (m.gold < 0) errors.push("Gold multiplier cannot be negative.");
    if (m.platinum < 0) errors.push("Platinum multiplier cannot be negative.");
    if (m.diamond < 0) errors.push("Diamond multiplier cannot be negative.");
    if (m.black_diamond < 0) errors.push("Black Diamond multiplier cannot be negative.");

    // 7. Referral Rules validations
    if (settings.referral_qualification_rules.min_referred_deposit < 0) {
      errors.push("Minimum referred deposit cannot be negative.");
    }

    return errors;
  }

  /**
   * Validates execution settings (month, year).
   */
  validateParams(params: EngineParams): string[] {
    const errors: string[] = [];

    if (params.month < 1 || params.month > 12) {
      errors.push(`Execution month must be between 1 and 12 (got ${params.month}).`);
    }

    const currentYear = new Date().getFullYear();
    if (params.year < 2020 || params.year > currentYear + 5) {
      errors.push(`Execution year is out of bounds (got ${params.year}).`);
    }

    return errors;
  }
}
