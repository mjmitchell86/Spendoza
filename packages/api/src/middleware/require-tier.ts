import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";
import type { SubscriptionTier } from "@spendoza/shared";

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
};

// In non-production environments (no Stripe key) all users are treated as pro
// and plan checks are off. Read per call so tests can switch it.
export function planChecksEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function meetsTier(
  tier: SubscriptionTier,
  minimumTier: SubscriptionTier
): boolean {
  return TIER_RANK[tier] >= TIER_RANK[minimumTier];
}

type TierDb = Pick<AuthenticatedRequest["supabase"], "from">;

export async function lookupTier(
  db: TierDb,
  userId: string
): Promise<SubscriptionTier> {
  const { data: profile } = await db
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();

  return (profile?.subscription_tier ?? "free") as SubscriptionTier;
}

export function sendUpgradeRequired(
  res: Response,
  requiredTier: SubscriptionTier,
  currentTier: SubscriptionTier
) {
  return res.status(403).json({
    error: "Upgrade required",
    required_tier: requiredTier,
    current_tier: currentTier,
  });
}

export function requireTier(minimumTier: SubscriptionTier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!planChecksEnabled()) return next();

    const { user, supabase: db } = req as AuthenticatedRequest;
    const userTier = await lookupTier(db, user.id);

    if (!meetsTier(userTier, minimumTier)) {
      return sendUpgradeRequired(res, minimumTier, userTier);
    }

    next();
  };
}
