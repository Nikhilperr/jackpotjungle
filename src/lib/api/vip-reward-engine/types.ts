export interface EngineParams {
  month: number;
  year: number;
  isSimulation: boolean;
}

export interface VipMultipliers {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
  diamond: number;
  black_diamond: number;
}

export interface ReferralQualificationRules {
  min_referred_deposit: number;
  requires_verification: boolean;
}

export interface VipRewardSettings {
  reward_pool_percentage: number;
  deposit_weight: number;
  holding_weight: number;
  referral_weight: number;
  loyalty_weight: number;
  reward_cap_percentage: number;
  min_monthly_deposit: number;
  min_holding_requirement: number;
  distribution_date: number;
  vip_multipliers: VipMultipliers;
  referral_qualification_rules: ReferralQualificationRules;
}

export interface UserActivity {
  user_id: string;
  email: string;
  username: string;
  vip_status: string;
  monthly_deposit: number;
  monthly_cashout: number;
  monthly_holding: number;
  referred_deposit_total: number;
  referral_count: number;
  loyalty_months: number;
}

export interface RewardResult {
  user_id: string;
  email: string;
  username: string;
  vip_status: string;
  monthly_deposit: number;
  monthly_cashout: number;
  monthly_holding: number;
  deposit_score: number;
  holding_score: number;
  referral_score: number;
  loyalty_score: number;
  base_score: number;
  multiplier: number;
  final_score: number;
  qualified: boolean;
  disqualification_reason: string | null;
  estimated_payout: number;
  reward_before_protection?: number;
  cap_applied?: boolean;
  final_reward?: number;
}

export interface SimulationResult {
  status: "success" | "error";
  error_message?: string;
  execution_time_ms: number;
  month: number;
  year: number;
  is_simulation: boolean;
  pool_size: number;
  total_qualified_users: number;
  total_distributed_rewards: number;
  configuration: VipRewardSettings | null;
  user_results: RewardResult[];
  logs: string[];
}
