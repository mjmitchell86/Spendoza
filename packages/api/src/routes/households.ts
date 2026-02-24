import { Router, type Response } from "express";
import {
  createHouseholdSchema,
  inviteToHouseholdSchema,
  joinHouseholdSchema,
  updateSharingSchema,
} from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import { generateInviteCode } from "../services/household.service";

const router = Router();

// ---------------------------------------------------------------------------
// GET / — get current user's household + members
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  // Look up user's household_id
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) {
    return res.status(404).json({ error: "Not a member of any household" });
  }

  const householdId = profile.household_id;

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
  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, income_sharing_mode, expense_sharing_mode")
    .eq("household_id", householdId);

  return res.status(200).json({ household, members: members ?? [] });
});

// ---------------------------------------------------------------------------
// POST / — create household
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /:id — get household details + member list
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res: Response) => {
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

  return res.status(200).json({ household, members });
});

// ---------------------------------------------------------------------------
// POST /:id/invite — invite by email (head of household only)
// ---------------------------------------------------------------------------
router.post(
  "/:id/invite",
  validate(inviteToHouseholdSchema),
  async (req, res: Response) => {
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
);

// ---------------------------------------------------------------------------
// POST /:id/join — join via invite code
// ---------------------------------------------------------------------------
router.post(
  "/:id/join",
  validate(joinHouseholdSchema),
  async (req, res: Response) => {
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
);

// ---------------------------------------------------------------------------
// DELETE /:id/members/:userId — remove member (head of household only)
// ---------------------------------------------------------------------------
router.delete("/:id/members/:userId", async (req, res: Response) => {
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
});

// ---------------------------------------------------------------------------
// PUT /:id/sharing — update sharing preferences
// ---------------------------------------------------------------------------
router.put(
  "/:id/sharing",
  validate(updateSharingSchema),
  async (req, res: Response) => {
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
);

export default router;
