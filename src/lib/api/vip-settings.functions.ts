import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Zod schemas for multipliers
const multipliersSchema = z.object({
  bronze: z.number().nonnegative(),
  silver: z.number().nonnegative(),
  gold: z.number().nonnegative(),
  platinum: z.number().nonnegative(),
  diamond: z.number().nonnegative(),
  black_diamond: z.number().nonnegative(),
});

// Zod schema for referral rules
const referralRulesSchema = z.object({
  min_referred_deposit: z.number().nonnegative(),
  requires_verification: z.boolean(),
});

// Input validator for updating settings
const updateSettingsValidator = z.object({
  rewardPoolPercentage: z.number().min(0).max(100),
  depositWeight: z.number().min(0),
  holdingWeight: z.number().min(0),
  referralWeight: z.number().min(0),
  loyaltyWeight: z.number().min(0),
  rewardCapPercentage: z.number().min(0).max(100),
  minMonthlyDeposit: z.number().min(0),
  minHoldingRequirement: z.number().min(0),
  distributionDate: z.number().min(1).max(28),
  vipMultipliers: multipliersSchema,
  referralQualificationRules: referralRulesSchema,
});

/**
 * Service: getVipRewardSettings
 * Returns the single configuration row if user is a Super Admin.
 */
export const getVipRewardSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      // 1. Verify caller has super_admin role
      const { data: roleRows, error: rolesErr } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);
      
      if (rolesErr) throw new Error(rolesErr.message);
      const isSuperAdmin = (roleRows ?? []).some((r: any) => r.role === "super_admin");
      if (!isSuperAdmin) throw new Error("Unauthorized: Super admins only");

      // 2. Fetch the active configuration row
      const { data: settings, error } = await context.supabase
        .from("vip_reward_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return { success: true, settings };
    } catch (e: any) {
      console.error("[getVipRewardSettings Error]:", e.message);
      return { success: false, error: e.message };
    }
  });

/**
 * Service: updateVipRewardSettings
 * Validates weights and parameters, then updates the configuration row.
 */
export const updateVipRewardSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(updateSettingsValidator)
  .handler(async ({ data, context }) => {
    try {
      // 1. Verify caller has super_admin role
      const { data: roleRows, error: rolesErr } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);
      
      if (rolesErr) throw new Error(rolesErr.message);
      const isSuperAdmin = (roleRows ?? []).some((r: any) => r.role === "super_admin");
      if (!isSuperAdmin) throw new Error("Unauthorized: Super admins only");

      // 2. Validate weights sum to exactly 100
      const totalWeight = data.depositWeight + data.holdingWeight + data.referralWeight + data.loyaltyWeight;
      if (Math.abs(totalWeight - 100) > 0.001) {
        throw new Error("Invalid Configuration: Score weights must sum to exactly 100.");
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // 3. Upsert the active configuration row
      const { error } = await supabaseAdmin
        .from("vip_reward_settings")
        .upsert({
          id: true,
          reward_pool_percentage: data.rewardPoolPercentage,
          deposit_weight: data.depositWeight,
          holding_weight: data.holdingWeight,
          referral_weight: data.referralWeight,
          loyalty_weight: data.loyaltyWeight,
          reward_cap_percentage: data.rewardCapPercentage,
          min_monthly_deposit: data.minMonthlyDeposit,
          min_holding_requirement: data.minHoldingRequirement,
          distribution_date: data.distributionDate,
          vip_multipliers: data.vipMultipliers,
          referral_qualification_rules: data.referralQualificationRules,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        }, { onConflict: "id" });

      if (error) throw new Error(error.message);
      return { success: true };
    } catch (e: any) {
      console.error("[updateVipRewardSettings Error]:", e.message);
      return { success: false, error: e.message };
    }
  });
