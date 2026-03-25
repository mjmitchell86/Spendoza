import type { ServiceContext } from "@spendoza/api/src/services/context";
import { supabaseAdmin, createSupabaseClient } from "../lib/supabase";
import type { SubscriptionTier } from "@spendoza/shared";

/**
 * Creates a ServiceContext from a Supabase access token.
 * Returns null if the token is invalid or the user cannot be resolved.
 */
export async function createSessionFromToken(
  accessToken: string
): Promise<ServiceContext | null> {
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) return null;

  return {
    supabase: createSupabaseClient(accessToken),
    supabaseAdmin,
    userId: user.id,
    email: user.email!,
  };
}

/**
 * Looks up a user's subscription tier from the profiles table.
 * Defaults to "free" if no profile or tier is found.
 */
export async function getUserTier(
  userId: string
): Promise<SubscriptionTier> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();
  return (data?.subscription_tier as SubscriptionTier) ?? "free";
}
