import { supabaseAdmin } from "../lib/supabase";

export const HOUSEHOLD_FULL_MESSAGE =
  "Household has reached the 10-member limit";

export const JOIN_FAILED_MESSAGE = "Couldn't join the household. Try again.";

// The status a caller answers with for an addToHousehold failure: a failed
// write is a server error, every other failure is a refusal.
export function joinFailureStatus(failure: string): 400 | 500 {
  return failure === JOIN_FAILED_MESSAGE ? 500 : 400;
}

// The checks and writes shared by joining with a code, accepting an
// invitation and signing up from an invitation. Returns an error message,
// or null once the user has joined.
export async function addToHousehold(
  user: { id: string; email?: string | null },
  householdId: string
): Promise<string | null> {
  // Check user is not already in a household
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (profile?.household_id) {
    return "Already a member of a household";
  }

  // Check 10-member limit
  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);

  if ((members?.length ?? 0) >= 10) {
    return HOUSEHOLD_FULL_MESSAGE;
  }

  // Update user's profile to join household. If this fails the user has not
  // joined, so their invitation must stay pending.
  const { error: joinError } = await supabaseAdmin
    .from("profiles")
    .update({ household_id: householdId })
    .eq("id", user.id);

  if (joinError) {
    console.error("[households] join profile update failed:", joinError);
    return JOIN_FAILED_MESSAGE;
  }

  // If there's a pending invitation for this user's email, mark it as accepted
  if (user.email) {
    await supabaseAdmin
      .from("household_invitations")
      .update({ status: "accepted" })
      .eq("household_id", householdId)
      .eq("email", user.email.toLowerCase())
      .eq("status", "pending");
  }

  return null;
}
