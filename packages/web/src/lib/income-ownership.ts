import type { HouseholdMember, IncomeEntry } from "@spendoza/shared";

// Only an income entry's owner deletes it or changes who it is attributed to; someone it is
// attributed to can edit the rest (the API refuses the others). Same rules as the iPhone app.

export const OWNER_ONLY_ATTRIBUTION =
  "Only the owner can change who this income is attributed to.";

export function ownsIncome(
  entry: Pick<IncomeEntry, "user_id">,
  userId: string | null | undefined
): boolean {
  return !!userId && entry.user_id === userId;
}

// Who the entry is attributed to, as the form names it ("You" when it is the person looking).
export function attributionText(
  entry: Pick<IncomeEntry, "attributed_to_user_id" | "attributed_to_name">,
  members?: Pick<HouseholdMember, "id" | "display_name">[],
  userId?: string | null
): string {
  if (entry.attributed_to_user_id && entry.attributed_to_user_id === userId)
    return "You";
  if (entry.attributed_to_user_id) {
    return (
      members?.find((m) => m.id === entry.attributed_to_user_id)
        ?.display_name ?? "Household member"
    );
  }
  return entry.attributed_to_name?.trim() || "Me (default)";
}

// The save body: without the attribution fields when the user may not change them.
export function incomeSaveBody<
  T extends { attributed_to_user_id?: unknown; attributed_to_name?: unknown },
>(
  data: T,
  canAttribute: boolean
): T | Omit<T, "attributed_to_user_id" | "attributed_to_name"> {
  if (canAttribute) return data;
  const {
    attributed_to_user_id: _userId,
    attributed_to_name: _name,
    ...rest
  } = data;
  return rest;
}
