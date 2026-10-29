import crypto from "crypto";
import {
  HOUSEHOLD_CODE_ALPHABET,
  HOUSEHOLD_CODE_LENGTH,
} from "@spendoza/shared";
import type { ServiceContext } from "./context";

export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex"); // 8-character hex string
}

/** 10-character Crockford base-32 household invite code (lowercase). */
export function generateHouseholdCode(): string {
  let code = "";
  for (let i = 0; i < HOUSEHOLD_CODE_LENGTH; i++) {
    code +=
      HOUSEHOLD_CODE_ALPHABET[crypto.randomInt(HOUSEHOLD_CODE_ALPHABET.length)];
  }
  return code;
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
