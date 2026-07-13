import { SupabaseClient } from "@supabase/supabase-js";
import { VipRewardSettings, VipMultipliers, ReferralQualificationRules } from "./types";

export class ConfigReaderService {
  /**
   * Fetches the single active VIP loyalty settings configuration from Supabase.
   * @param supabase Supabase client (usually admin or user authenticated client)
   */
  async getActiveSettings(supabase: SupabaseClient): Promise<VipRewardSettings | null> {
    try {
      const { data, error } = await supabase
        .from("vip_reward_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();

      if (error) {
        throw new Error(`Database error fetching VIP settings: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      // Safe mapping/casting from DB fields
      const multipliers: VipMultipliers = {
        bronze: Number(data.vip_multipliers?.bronze ?? 1.0),
        silver: Number(data.vip_multipliers?.silver ?? 1.05),
        gold: Number(data.vip_multipliers?.gold ?? 1.1),
        platinum: Number(data.vip_multipliers?.platinum ?? 1.2),
        diamond: Number(data.vip_multipliers?.diamond ?? 1.3),
        black_diamond: Number(data.vip_multipliers?.black_diamond ?? 1.5),
      };

      const referralRules: ReferralQualificationRules = {
        min_referred_deposit: Number(data.referral_qualification_rules?.min_referred_deposit ?? 50.0),
        requires_verification: Boolean(data.referral_qualification_rules?.requires_verification ?? false),
      };

      return {
        reward_pool_percentage: Number(data.reward_pool_percentage ?? 5.0),
        deposit_weight: Number(data.deposit_weight ?? 35.0),
        holding_weight: Number(data.holding_weight ?? 30.0),
        referral_weight: Number(data.referral_weight ?? 15.0),
        loyalty_weight: Number(data.loyalty_weight ?? 20.0),
        reward_cap_percentage: Number(data.reward_cap_percentage ?? 10.0),
        min_monthly_deposit: Number(data.min_monthly_deposit ?? 100.0),
        min_holding_requirement: Number(data.min_holding_requirement ?? 50.0),
        distribution_date: Number(data.distribution_date ?? 1),
        vip_multipliers: multipliers,
        referral_qualification_rules: referralRules,
      };
    } catch (e: any) {
      console.error("[ConfigReaderService Error]:", e.message);
      throw e;
    }
  }
}
