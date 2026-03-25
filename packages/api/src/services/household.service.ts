import crypto from "crypto";
import type { ServiceContext } from "./context";

export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex"); // 8-character hex string
}

export async function resolveEntity(
  ctx: ServiceContext,
  entityTypeParam?: string
): Promise<{
  data: { entityType: "user" | "household"; entityId: string } | null;
  error: { message: string } | null;
}> {
  if (!entityTypeParam || entityTypeParam === "user") {
    return {
      data: { entityType: "user", entityId: ctx.userId },
      error: null,
    };
  }

  if (entityTypeParam === "household") {
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("household_id")
      .eq("id", ctx.userId)
      .single();

    if (!profile?.household_id) {
      return {
        data: null,
        error: { message: "You are not a member of any household" },
      };
    }

    return {
      data: { entityType: "household", entityId: profile.household_id },
      error: null,
    };
  }

  return {
    data: null,
    error: { message: "Invalid entity_type" },
  };
}

export async function validateHouseholdMembership(
  ctx: ServiceContext,
  targetUserId: string
): Promise<boolean> {
  const [{ data: currentProfile }, { data: targetProfile }] = await Promise.all(
    [
      ctx.supabase
        .from("profiles")
        .select("household_id")
        .eq("id", ctx.userId)
        .single(),
      ctx.supabase
        .from("profiles")
        .select("household_id")
        .eq("id", targetUserId)
        .single(),
    ]
  );

  if (!currentProfile?.household_id || !targetProfile?.household_id) {
    return false;
  }

  return currentProfile.household_id === targetProfile.household_id;
}
