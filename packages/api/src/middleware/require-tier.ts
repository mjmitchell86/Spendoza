import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";
import type { SubscriptionTier } from "@spendoza/shared";

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
};

const stripeEnabled = !!process.env.STRIPE_SECRET_KEY;

export function requireTier(minimumTier: SubscriptionTier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // In non-production environments, all users are treated as pro
    if (!stripeEnabled) return next();

    const { user, supabase: db } = req as AuthenticatedRequest;

    const { data: profile } = await db
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user.id)
      .single();

    const userTier = (profile?.subscription_tier ?? "free") as SubscriptionTier;

    if (TIER_RANK[userTier] < TIER_RANK[minimumTier]) {
      return res.status(403).json({
        error: "Upgrade required",
        required_tier: minimumTier,
        current_tier: userTier,
      });
    }

    next();
  };
}
