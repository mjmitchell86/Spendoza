import type { Request, Response, NextFunction } from "express";
import { normalizeInviteCode } from "@spendoza/shared";
import type { SubscriptionTier } from "@spendoza/shared";
import type { AuthenticatedRequest } from "./auth";
import { supabaseAdmin } from "../lib/supabase";
import {
  planChecksEnabled,
  lookupTier,
  meetsTier,
  sendUpgradeRequired,
} from "./require-tier";

export type HouseholdPlanMode = "caller" | "callerOrHead";

// The head's tier, or null when the household doesn't exist.
async function headTier(householdId: string): Promise<SubscriptionTier | null> {
  const { data: household } = await supabaseAdmin
    .from("households")
    .select("head_of_household_id")
    .eq("id", householdId)
    .maybeSingle();
  if (!household?.head_of_household_id) return null;
  return lookupTier(supabaseAdmin, household.head_of_household_id);
}

// Whether a household's head is on Pro, or plan checks are off. Used by
// sign-up from an invitation (no authenticated caller).
export async function householdHeadOnPro(
  householdId: string
): Promise<boolean> {
  if (!planChecksEnabled()) return true;
  const tier = await headTier(householdId);
  return tier !== null && meetsTier(tier, "pro");
}

// The household the request acts on: an explicit :id, the household of the
// invitation being accepted, the household a join code belongs to, or else the
// caller's own household. Null when it can't be found.
async function targetHouseholdId(req: Request): Promise<string | null> {
  const { user, supabase: db } = req as AuthenticatedRequest;

  if (req.params.id) return req.params.id;

  if (req.params.invitationId) {
    const { data } = await supabaseAdmin
      .from("household_invitations")
      .select("household_id")
      .eq("id", req.params.invitationId)
      .maybeSingle();
    return data?.household_id ?? null;
  }

  if (typeof req.body?.invite_code === "string") {
    const { data } = await supabaseAdmin
      .from("household_invite_codes")
      .select("household_id")
      .eq("code", normalizeInviteCode(req.body.invite_code))
      .maybeSingle();
    return data?.household_id ?? null;
  }

  const { data: profile } = await db
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();
  return profile?.household_id ?? null;
}

// "caller": the caller must be on Pro (create a household, head-only
// management). "callerOrHead": the caller is on Pro, or the target
// household's head is. A no-op when plan checks are off, like requireTier.
export function requireHouseholdPlan(mode: HouseholdPlanMode) {
  const middleware = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!planChecksEnabled()) return next();

    const { user, supabase: db } = req as AuthenticatedRequest;
    const callerTier = await lookupTier(db, user.id);
    if (meetsTier(callerTier, "pro")) return next();

    if (mode === "callerOrHead") {
      const householdId = await targetHouseholdId(req);
      // No household found: nothing to grant, and the handler rejects it
      if (!householdId) return next();
      const tier = await headTier(householdId);
      if (tier === null || meetsTier(tier, "pro")) return next();
    }

    return sendUpgradeRequired(res, "pro", callerTier);
  };
  // Lets tests enumerate which routes carry which mode
  return Object.assign(middleware, { planMode: mode });
}
