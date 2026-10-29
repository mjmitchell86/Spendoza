import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import rateLimit from "express-rate-limit";
import {
  createHouseholdSchema,
  renameHouseholdSchema,
  deleteHouseholdSchema,
  inviteToHouseholdSchema,
  joinHouseholdSchema,
  updateSharingSchema,
  transferOwnershipSchema,
  normalizeInviteCode,
} from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  generateHouseholdCode,
  deleteHousehold,
} from "../services/household.service";

const router = Router();

// ---------------------------------------------------------------------------
// Middleware: resolve user's household_id and inject it as req.params.id
// ---------------------------------------------------------------------------
async function resolveHousehold(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const { data: profile } = await db
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

// The invite code lives in its own head-only table. Add it to the household
// only when the caller is the head; for everyone else the key is absent.
async function householdForCaller<
  T extends { id: string; head_of_household_id: string },
>(db: AuthenticatedRequest["supabase"], household: T, userId: string) {
  if (household.head_of_household_id !== userId) return household;
  const { data } = await db
    .from("household_invite_codes")
    .select("code")
    .eq("household_id", household.id)
    .single();
  return data?.code ? { ...household, invite_code: data.code } : household;
}

async function getHouseholdHandler(req: Request, res: Response) {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  // Verify user is a member of this household
  const { data: profile } = await db
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.household_id !== householdId) {
    return res.status(403).json({ error: "Not a member of this household" });
  }

  // Get household details
  const { data: household, error: hhError } = await db
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();

  if (hhError || !household) {
    return res.status(404).json({ error: "Household not found" });
  }

  // Get members
  const { data: members, error: membersError } = await db
    .from("profiles")
    .select("id, display_name, income_sharing_mode, expense_sharing_mode")
    .eq("household_id", householdId);

  if (membersError) {
    return res.status(400).json({ error: membersError.message });
  }

  return res.status(200).json({
    household: await householdForCaller(db, household, user.id),
    members: members ?? [],
  });
}

const UNIQUE_VIOLATION = "23505";
const ROTATE_ATTEMPTS = 3;

async function rotateInviteCode(householdId: string): Promise<string> {
  for (let attempt = 0; attempt < ROTATE_ATTEMPTS; attempt++) {
    const code = generateHouseholdCode();
    const { data, error } = await supabaseAdmin
      .from("household_invite_codes")
      .upsert(
        {
          household_id: householdId,
          code,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "household_id" }
      )
      .select();

    if (!error) {
      if (data?.length !== 1) throw new Error("Invite code was not saved");
      return code;
    }
    if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
  }
  throw new Error("Could not generate a unique invite code");
}

async function rotateInviteCodeHandler(req: Request, res: Response) {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  const { data: household } = await db
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();

  if (!household || household.head_of_household_id !== user.id) {
    return res
      .status(403)
      .json({ error: "Only the head of household can change the invite code" });
  }

  try {
    const invite_code = await rotateInviteCode(householdId);
    return res.status(200).json({ invite_code });
  } catch (err) {
    console.error("[households] rotate invite code failed:", err);
    return res.status(500).json({ error: "Failed to generate a new code" });
  }
}

async function inviteHandler(req: Request, res: Response) {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  // Verify user is head of household
  const { data: household } = await db
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
  const { data: members } = await db
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);

  const { data: pendingInvites } = await db
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
  const { error } = await db.from("household_invitations").insert({
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
  const { data: row } = await supabaseAdmin
    .from("household_invite_codes")
    .select("household_id, code")
    .eq("household_id", req.params.id)
    .maybeSingle();

  return joinHousehold(req, res, row);
}

async function joinByCodeHandler(req: Request, res: Response) {
  const { data: row } = await supabaseAdmin
    .from("household_invite_codes")
    .select("household_id, code")
    .eq("code", normalizeInviteCode(req.body.invite_code))
    .maybeSingle();

  return joinHousehold(req, res, row);
}

async function joinHousehold(
  req: Request,
  res: Response,
  row: { household_id: string; code: string } | null
) {
  const { user } = req as AuthenticatedRequest;

  // Validate invite code matches household
  if (!row || row.code !== normalizeInviteCode(req.body.invite_code)) {
    return res.status(400).json({ error: "Invalid invite code" });
  }
  const householdId = row.household_id;

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

  // The target must actually belong to this household
  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (!target) {
    return res
      .status(404)
      .json({ error: "Member not found in this household" });
  }

  // The removed member knew the code: rotate it first, so there is never a
  // moment when they are out but the old code still works
  try {
    await rotateInviteCode(householdId);
  } catch (err) {
    console.error("[households] rotate before removal failed:", err);
    return res.status(500).json({ error: "Failed to remove member" });
  }

  // Set the removed member's household_id to null
  const { error: removeError } = await supabaseAdmin
    .from("profiles")
    .update({ household_id: null })
    .eq("id", targetUserId)
    .eq("household_id", householdId);

  if (removeError) {
    return res.status(500).json({ error: "Failed to remove member" });
  }

  return res.status(204).send();
}

async function updateSharingHandler(req: Request, res: Response) {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  // Verify user is a member of this household
  const { data: profile } = await db
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.household_id !== householdId) {
    return res.status(403).json({ error: "Not a member of this household" });
  }

  // Update sharing preferences
  const { data, error } = await db
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
  const { user, supabase: db } = req as AuthenticatedRequest;
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
      return res.status(400).json({
        error: "Head of household cannot leave. Transfer ownership first.",
      });
    }

    // Sole member — deleting the household also clears their household_id
    try {
      await deleteHousehold(householdId);
    } catch (err) {
      console.error("[households] delete on leave failed:", err);
      return res.status(500).json({ error: "Failed to leave household" });
    }

    return res
      .status(200)
      .json({ message: "Left and deleted household successfully" });
  }

  await db.from("profiles").update({ household_id: null }).eq("id", user.id);

  return res.status(200).json({ message: "Left household successfully" });
}

async function renameHandler(req: Request, res: Response) {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  const { data: household } = await db
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();

  if (!household || household.head_of_household_id !== user.id) {
    return res.status(403).json({
      error: "Only the head of household can rename the household",
    });
  }

  // Admin client after the head check above (see transferOwnershipHandler)
  const { data: updated, error } = await supabaseAdmin
    .from("households")
    .update({ name: req.body.name })
    .eq("id", householdId)
    .select()
    .single();

  if (error || !updated) {
    return res
      .status(400)
      .json({ error: error?.message ?? "Failed to rename household" });
  }

  return res.status(200).json(await householdForCaller(db, updated, user.id));
}

async function deleteHouseholdHandler(req: Request, res: Response) {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  const { data: household } = await db
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();

  if (!household || household.head_of_household_id !== user.id) {
    return res.status(403).json({
      error: "Only the head of household can delete the household",
    });
  }

  if (req.body.confirm_name !== household.name) {
    return res
      .status(400)
      .json({ error: "Type the household name to confirm" });
  }

  try {
    await deleteHousehold(householdId);
  } catch (err) {
    console.error("[households] delete failed:", err);
    return res.status(500).json({ error: "Failed to delete household" });
  }

  return res.status(204).send();
}

async function transferOwnershipHandler(req: Request, res: Response) {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const householdId = req.params.id;

  // Verify caller is head of household
  const { data: household } = await db
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
    return res
      .status(400)
      .json({ error: "Cannot transfer ownership to yourself" });
  }

  // Verify new head is a member of the same household
  const { data: targetProfile } = await db
    .from("profiles")
    .select("household_id")
    .eq("id", new_head_id)
    .single();

  if (!targetProfile || targetProfile.household_id !== householdId) {
    return res
      .status(400)
      .json({ error: "Target user is not a member of this household" });
  }

  // Update head_of_household_id. Done with the admin client after the checks
  // above: the "Head can update household" policy has no WITH CHECK, so
  // Postgres rejects the new row (head is someone else) for the RLS client.
  const { data: updated, error } = await supabaseAdmin
    .from("households")
    .update({ head_of_household_id: new_head_id })
    .eq("id", householdId)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(await householdForCaller(db, updated, user.id));
}

// ---------------------------------------------------------------------------
// Routes without household ID (resolve from user's profile)
// These MUST be registered before /:id routes to avoid path conflicts.
// ---------------------------------------------------------------------------
router.get("/", resolveHousehold, getHouseholdHandler);
router.post(
  "/",
  validate(createHouseholdSchema),
  async (req, res: Response) => {
    const { user, supabase: db } = req as AuthenticatedRequest;

    const { data: existing } = await db
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (existing?.household_id) {
      return res
        .status(400)
        .json({ error: "Leave your household before creating a new one" });
    }

    const invite_code = generateHouseholdCode();

    const { data: household, error } = await db
      .from("households")
      .insert({
        name: req.body.name,
        head_of_household_id: user.id,
      })
      .select()
      .single();

    if (error || !household) {
      return res
        .status(400)
        .json({ error: error?.message ?? "Failed to create household" });
    }

    const { error: codeError } = await supabaseAdmin
      .from("household_invite_codes")
      .insert({ household_id: household.id, code: invite_code });

    if (codeError) {
      await supabaseAdmin.from("households").delete().eq("id", household.id);
      return res.status(400).json({ error: codeError.message });
    }

    // Update the user's profile to set household_id
    await db
      .from("profiles")
      .update({ household_id: household.id })
      .eq("id", user.id);

    return res.status(201).json({ ...household, invite_code });
  }
);
router.put(
  "/sharing",
  resolveHousehold,
  validate(updateSharingSchema),
  updateSharingHandler
);
router.post(
  "/invite",
  resolveHousehold,
  validate(inviteToHouseholdSchema),
  inviteHandler
);
router.post("/invite-code", resolveHousehold, rotateInviteCodeHandler);
router.patch(
  "/",
  resolveHousehold,
  validate(renameHouseholdSchema),
  renameHandler
);
router.delete(
  "/",
  resolveHousehold,
  validate(deleteHouseholdSchema),
  deleteHouseholdHandler
);
router.post("/leave", resolveHousehold, leaveHandler);
// The code alone is the credential here, so cap failed guesses per user.
const joinByCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => (req as AuthenticatedRequest).user.id,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});
router.post(
  "/join",
  joinByCodeLimiter,
  validate(joinHouseholdSchema),
  joinByCodeHandler
);
router.post(
  "/transfer",
  resolveHousehold,
  validate(transferOwnershipSchema),
  transferOwnershipHandler
);
router.delete("/members/:userId", resolveHousehold, removeMemberHandler);

// ---------------------------------------------------------------------------
// Routes with explicit household ID
// ---------------------------------------------------------------------------
router.get("/:id", getHouseholdHandler);
router.patch("/:id", validate(renameHouseholdSchema), renameHandler);
router.delete("/:id", validate(deleteHouseholdSchema), deleteHouseholdHandler);
router.post("/:id/invite", validate(inviteToHouseholdSchema), inviteHandler);
router.post("/:id/invite-code", rotateInviteCodeHandler);
router.post("/:id/join", validate(joinHouseholdSchema), joinHandler);
router.post(
  "/:id/transfer",
  validate(transferOwnershipSchema),
  transferOwnershipHandler
);
router.delete("/:id/members/:userId", removeMemberHandler);
router.put("/:id/sharing", validate(updateSharingSchema), updateSharingHandler);

export default router;
