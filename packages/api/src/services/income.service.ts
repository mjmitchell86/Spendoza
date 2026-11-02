import type { CreateIncomeInput, UpdateIncomeInput } from "@spendoza/shared";
import type { ServiceContext } from "./context";

// ---------------------------------------------------------------------------
// listIncome — queries income_entries owned by OR attributed to user
// ---------------------------------------------------------------------------
export async function listIncome(ctx: ServiceContext) {
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("income_entries")
    .select("*")
    .or(`user_id.eq.${userId},attributed_to_user_id.eq.${userId}`)
    .order("effective_date", { ascending: false });

  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// createIncome — validates household membership if attributed, then inserts
// ---------------------------------------------------------------------------
export async function createIncome(ctx: ServiceContext, input: CreateIncomeInput) {
  const { supabase, userId } = ctx;

  if (input.attributed_to_user_id) {
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("household_id")
      .eq("id", userId)
      .single();

    const { data: attributedProfile } = await supabase
      .from("profiles")
      .select("household_id")
      .eq("id", input.attributed_to_user_id)
      .single();

    if (
      !currentProfile?.household_id ||
      !attributedProfile?.household_id ||
      currentProfile.household_id !== attributedProfile.household_id
    ) {
      return {
        data: null,
        error: { message: "Attributed user is not in your household" },
      };
    }
  }

  const { data, error } = await supabase
    .from("income_entries")
    .insert({ ...input, user_id: userId })
    .select()
    .single();

  return { data: data ?? null, error: error ?? null };
}

const NOT_OWNER_ATTRIBUTION_ERROR = {
  message: "Only the owner can change who this income is attributed to",
  status: 403,
};

// A blank or missing attribution is no attribution.
function sameAttribution(sent: string | null | undefined, stored: string | null | undefined) {
  return (sent?.trim() || null) === (stored?.trim() || null);
}

// ---------------------------------------------------------------------------
// updateIncome — updates by id for the owner or the attributed user. Only the
// owner may change who it is attributed to (RLS rejects the attributed user's
// new row, which would otherwise read as "not found").
// ---------------------------------------------------------------------------
export async function updateIncome(
  ctx: ServiceContext,
  id: string,
  input: UpdateIncomeInput
) {
  const { supabase, userId } = ctx;

  if (input.attributed_to_user_id !== undefined || input.attributed_to_name !== undefined) {
    const { data: stored } = await supabase
      .from("income_entries")
      .select("user_id, attributed_to_user_id, attributed_to_name")
      .eq("id", id)
      .single();
    const changes =
      (input.attributed_to_user_id !== undefined &&
        !sameAttribution(input.attributed_to_user_id, stored?.attributed_to_user_id)) ||
      (input.attributed_to_name !== undefined &&
        !sameAttribution(input.attributed_to_name, stored?.attributed_to_name));
    if (stored && stored.user_id !== userId && changes) {
      return { data: null, error: NOT_OWNER_ATTRIBUTION_ERROR };
    }
  }

  const { data, error } = await supabase
    .from("income_entries")
    .update(input)
    .eq("id", id)
    .or(`user_id.eq.${userId},attributed_to_user_id.eq.${userId}`)
    .select()
    .single();

  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// deleteIncome — deletes by id + user_id (owner only). `deleted` is 0 when
// there is no such entry or it is only attributed to the user.
// ---------------------------------------------------------------------------
export async function deleteIncome(ctx: ServiceContext, id: string) {
  const { supabase, userId } = ctx;

  const { error, count } = await supabase
    .from("income_entries")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", userId);

  return { deleted: count ?? 0, error: error ?? null };
}
