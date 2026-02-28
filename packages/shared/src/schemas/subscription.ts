import { z } from "zod";

// ---------------------------------------------------------------------------
// Tier enum
// ---------------------------------------------------------------------------
export const subscriptionTierSchema = z.enum(["free", "starter", "pro"]);
export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;

// ---------------------------------------------------------------------------
// Feature limits per tier
// ---------------------------------------------------------------------------
export const TIER_LIMITS = {
  free: {
    statements_per_month: 2,
    ai_categorization: false,
    email_reports: false,
    goals: false,
    plaid: false,
    household: false,
  },
  starter: {
    statements_per_month: Infinity,
    ai_categorization: true,
    email_reports: true,
    goals: true,
    plaid: false,
    household: false,
  },
  pro: {
    statements_per_month: Infinity,
    ai_categorization: true,
    email_reports: true,
    goals: true,
    plaid: true,
    household: true,
  },
} as const;

// ---------------------------------------------------------------------------
// Subscription row
// ---------------------------------------------------------------------------
export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  tier: SubscriptionTier;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}
