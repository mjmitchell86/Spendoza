import { Router, type Request, type Response, type NextFunction } from "express";
import {
  createHouseholdSchema,
  inviteToHouseholdSchema,
  joinHouseholdSchema,
  updateSharingSchema,
  transferOwnershipSchema,
} from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import { generateInviteCode } from "../services/household.service";

const router = Router();

// ---------------------------------------------------------------------------
// Middleware: resolve user's household_id and inject it as req.params.id
// ---------------------------------------------------------------------------
async function resolveHousehold(req: Request, res: Response, next: NextFunction) {
  const { user } = req as AuthenticatedRequest;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) {
    return res.status(404).json({ error: "Not a member of any household" });
  }
  req.params.id = profile.household_id;
  next();
}

// ---------------------------------------------------------------------------
// Handlers (shared between /path and /:id/path routes)
// ---------------------------------------------------------------------------

async function getHouseholdHandler(req: Request, res: Response) {
  const { user } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  // Verify user is a member of this household
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.household_id !== householdId) {
    return res.status(403).json({ error: "Not a member of this household" });
  }

  // Get household details
  const { data: household, error: hhError } = await supabaseAdmin
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();

  if (hhError || !household) {
    return res.status(404).json({ error: "Household not found" });
  }

  // Get members
  const { data: members, error: membersError } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, income_sharing_mode, expense_sharing_mode")
    .eq("household_id", householdId);

  if (membersError) {
    return res.status(400).json({ error: membersError.message });
  }

  return res.status(200).json({ household, members: members ?? [] });
}

async function inviteHandler(req: Request, res: Response) {
  const { user } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  // Verify user is head of household
  const { data: household } = await supabaseAdmin
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();

  if (!household || household.head_of_household_id !== user.id) {
    return res
      .status(403)
      .json({ error: "Only the head of household can invite members" });
  }

  // Check 10-member limit (current members + pending invitations)
  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);

  const { data: pendingInvites } = await supabaseAdmin
    .from("household_invitations")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "pending");

  const memberCount = (members?.length ?? 0) + (pendingInvites?.length ?? 0);
  if (memberCount >= 10) {
    return res
      .status(400)
      .json({ error: "Household has reached the 10-member limit" });
  }

  // Insert invitation
  const { error } = await supabaseAdmin
    .from("household_invitations")
    .insert({
      household_id: householdId,
      email: req.body.email,
      invited_by: user.id,
      status: "pending",
    });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({ message: "Invitation sent" });
}

async function joinHandler(req: Request, res: Response) {
  const { user } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  // Validate invite code matches household
  const { data: household } = await supabaseAdmin
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();

  if (!household || household.invite_code !== req.body.invite_code) {
    return res.status(400).json({ error: "Invalid invite code" });
  }

  // Check user is not already in a household
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (profile?.household_id) {
    return res.status(400).json({ error: "Already a member of a household" });
  }

  // Check 10-member limit
  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);

  if ((members?.length ?? 0) >= 10) {
    return res
      .status(400)
      .json({ error: "Household has reached the 10-member limit" });
  }

  // Update user's profile to join household
  await supabaseAdmin
    .from("profiles")
    .update({ household_id: householdId })
    .eq("id", user.id);

  // If there's a pending invitation for this user's email, mark it as accepted
  await supabaseAdmin
    .from("household_invitations")
    .update({ status: "accepted" })
    .eq("household_id", householdId)
    .eq("email", user.email)
    .eq("status", "pending");

  return res.status(200).json({ message: "Joined household successfully" });
}

async function removeMemberHandler(req: Request, res: Response) {
  const { user } = req as AuthenticatedRequest;
  const householdId = req.params.id;
  const targetUserId = req.params.userId;

  // Verify user is head of household
  const { data: household } = await supabaseAdmin
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();

  if (!household || household.head_of_household_id !== user.id) {
    return res
      .status(403)
      .json({ error: "Only the head of household can remove members" });
  }

  // Cannot remove self (head)
  if (targetUserId === user.id) {
    return res
      .status(400)
      .json({ error: "Cannot remove yourself as head of household" });
  }

  // Set the removed member's household_id to null
  await supabaseAdmin
    .from("profiles")
    .update({ household_id: null })
    .eq("id", targetUserId);

  return res.status(204).send();
}

async function updateSharingHandler(req: Request, res: Response) {
  const { user } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  // Verify user is a member of this household
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.household_id !== householdId) {
    return res.status(403).json({ error: "Not a member of this household" });
  }

  // Update sharing preferences
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({
      income_sharing_mode: req.body.income_sharing_mode,
      shared_income_amount: req.body.shared_income_amount,
      expense_sharing_mode: req.body.expense_sharing_mode,
    })
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
}

async function leaveHandler(req: Request, res: Response) {
  const { user } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  // Check if user is head of household
  const { data: household } = await supabaseAdmin
    .from("households")
    .select("head_of_household_id")
    .eq("id", householdId)
    .single();

  // Count members to decide if sole-member head can leave
  const { data: allMembers } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);

  if (household?.head_of_household_id === user.id) {
    if ((allMembers?.length ?? 0) > 1) {
      return res
        .status(400)
        .json({ error: "Head of household cannot leave. Transfer ownership first." });
    }

    // Sole member — remove from household then delete it
    await supabaseAdmin
      .from("profiles")
      .update({ household_id: null })
      .eq("id", user.id);

    await supabaseAdmin.from("households").delete().eq("id", householdId);

    return res.status(200).json({ message: "Left and deleted household successfully" });
  }

  await supabaseAdmin
    .from("profiles")
    .update({ household_id: null })
    .eq("id", user.id);

  return res.status(200).json({ message: "Left household successfully" });
}

async function transferOwnershipHandler(req: Request, res: Response) {
  const { user } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  // Verify caller is head of household
  const { data: household } = await supabaseAdmin
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();

  if (!household || household.head_of_household_id !== user.id) {
    return res
      .status(403)
      .json({ error: "Only the head of household can transfer ownership" });
  }

  const { new_head_id } = req.body;

  // Can't transfer to self
  if (new_head_id === user.id) {
    return res.status(400).json({ error: "Cannot transfer ownership to yourself" });
  }

  // Verify new head is a member of the same household
  const { data: targetProfile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", new_head_id)
    .single();

  if (!targetProfile || targetProfile.household_id !== householdId) {
    return res.status(400).json({ error: "Target user is not a member of this household" });
  }

  // Update head_of_household_id
  const { data: updated, error } = await supabaseAdmin
    .from("households")
    .update({ head_of_household_id: new_head_id })
    .eq("id", householdId)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(updated);
}

// ---------------------------------------------------------------------------
// Routes without household ID (resolve from user's profile)
// These MUST be registered before /:id routes to avoid path conflicts.
// ---------------------------------------------------------------------------
router.get("/", resolveHousehold, getHouseholdHandler);
router.post("/", validate(createHouseholdSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const invite_code = generateInviteCode();

  const { data: household, error } = await supabaseAdmin
    .from("households")
    .insert({
      name: req.body.name,
      head_of_household_id: user.id,
      invite_code,
    })
    .select()
    .single();

  if (error || !household) {
    return res.status(400).json({ error: error?.message ?? "Failed to create household" });
  }

  // Update the user's profile to set household_id
  await supabaseAdmin
    .from("profiles")
    .update({ household_id: household.id })
    .eq("id", user.id);

  return res.status(201).json(household);
});
router.put("/sharing", resolveHousehold, validate(updateSharingSchema), updateSharingHandler);
router.post("/invite", resolveHousehold, validate(inviteToHouseholdSchema), inviteHandler);
router.post("/leave", resolveHousehold, leaveHandler);
router.post("/transfer", resolveHousehold, validate(transferOwnershipSchema), transferOwnershipHandler);
router.delete("/members/:userId", resolveHousehold, removeMemberHandler);

// ---------------------------------------------------------------------------
// Routes with explicit household ID
// ---------------------------------------------------------------------------
router.get("/:id", getHouseholdHandler);
router.post("/:id/invite", validate(inviteToHouseholdSchema), inviteHandler);
router.post("/:id/join", validate(joinHouseholdSchema), joinHandler);
router.post("/:id/transfer", validate(transferOwnershipSchema), transferOwnershipHandler);
router.delete("/:id/members/:userId", removeMemberHandler);
router.put("/:id/sharing", validate(updateSharingSchema), updateSharingHandler);

export default router;
