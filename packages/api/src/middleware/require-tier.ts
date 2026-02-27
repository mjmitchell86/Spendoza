import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";
import { supabaseAdmin } from "../lib/supabase";
import type { SubscriptionTier } from "@spendoza/shared";

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
};

const isProduction = process.env.VERCEL_ENV === "production";

export function requireTier(minimumTier: SubscriptionTier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // In non-production environments, all users are treated as pro
    if (!isProduction) return next();

    const { user } = req as AuthenticatedRequest;

    const { data: profile } = await supabaseAdmin
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
