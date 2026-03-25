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

// ---------------------------------------------------------------------------
// updateIncome — updates by id + user_id (owner only)
// ---------------------------------------------------------------------------
export async function updateIncome(
  ctx: ServiceContext,
  id: string,
  input: UpdateIncomeInput
) {
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("income_entries")
    .update(input)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// deleteIncome — deletes by id + user_id (owner only)
// ---------------------------------------------------------------------------
export async function deleteIncome(ctx: ServiceContext, id: string) {
  const { supabase, userId } = ctx;

  const { error } = await supabase
    .from("income_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  return { error: error ?? null };
}
