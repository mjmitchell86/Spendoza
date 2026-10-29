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
  invitationCodeSchema,
} from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { requireHouseholdPlan } from "../middleware/require-household-plan";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  generateHouseholdCode,
  deleteHousehold,
} from "../services/household.service";
import {
  addToHousehold,
  joinFailureStatus,
} from "../services/household-membership.service";
import { sendHouseholdInvitationEmail } from "../services/email.service";

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

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;
const MEMBER_LIMIT = 10;

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

  // Emails are stored and matched lowercased
  const email = String(req.body.email).toLowerCase();
  const now = Date.now();

  // An invitation already pending for this email is refreshed and resent
  // (keeping its code), live or expired, instead of stacking a second row.
  const { data: existing } = await supabaseAdmin
    .from("household_invitations")
    .select("id, code, expires_at, last_sent_at")
    .eq("household_id", householdId)
    .eq("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existingIsLive =
    !!existing && new Date(existing.expires_at).getTime() > now;

  if (
    existingIsLive &&
    existing.last_sent_at && // null: legacy invitation, never sent by this flow
    now - new Date(existing.last_sent_at).getTime() < RESEND_COOLDOWN_MS
  ) {
    return res.status(429).json({
      error: "You just sent this invitation. Try again in a few minutes.",
    });
  }

  // Check 10-member limit (members + live pending invitations). Admin client:
  // the RLS client under-counts after a head transfer. An invitation being
  // resent is not counted against itself.
  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);

  const { data: pendingInvites } = await supabaseAdmin
    .from("household_invitations")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .gt("expires_at", new Date(now).toISOString());

  const memberCount =
    (members?.length ?? 0) +
    (pendingInvites?.filter((i) => i.id !== existing?.id).length ?? 0);
  if (memberCount >= MEMBER_LIMIT) {
    return res
      .status(400)
      .json({ error: "Household has reached the 10-member limit" });
  }

  // last_sent_at is written only once the email has gone out, so a failed
  // send doesn't start the resend cooldown.
  const timing = {
    expires_at: new Date(now + INVITATION_TTL_MS).toISOString(),
  };

  let code: string;
  let created = false;
  if (existing) {
    code = existing.code ?? generateHouseholdCode();
    const { error } = await supabaseAdmin
      .from("household_invitations")
      .update(existing.code ? timing : { ...timing, code })
      .eq("id", existing.id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }
  } else {
    // Insert invitation (admin client: the head was verified above)
    code = "";
    let insertError: { code?: string; message: string } | null = null;
    for (let attempt = 0; attempt < ROTATE_ATTEMPTS; attempt++) {
      code = generateHouseholdCode();
      const { error } = await supabaseAdmin
        .from("household_invitations")
        .insert({
          household_id: householdId,
          email,
          invited_by: user.id,
          status: "pending",
          code,
          ...timing,
          last_sent_at: null,
        });
      insertError = error;
      if (!error || error.code !== UNIQUE_VIOLATION) break;
    }

    if (insertError) {
      return res.status(400).json({ error: insertError.message });
    }
    created = true;
  }

  const { data: inviter } = await db
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  // The invitation stays pending if the email fails, so the head can retry
  try {
    await sendHouseholdInvitationEmail(
      email,
      inviter?.display_name || "A Spendoza member",
      household.name,
      code
    );
  } catch (err) {
    console.error("[households] invitation email failed:", err);
    return res
      .status(502)
      .json({ error: "Couldn't send the invitation email. Try again." });
  }

  // Only one pending invitation exists per household and email (the resend
  // path above reuses it), so this marks exactly the one just sent.
  const { error: sentError } = await supabaseAdmin
    .from("household_invitations")
    .update({ last_sent_at: new Date(now).toISOString() })
    .eq("household_id", householdId)
    .eq("email", email)
    .eq("status", "pending");
  if (sentError) {
    // The email went out; only the resend cooldown is missing
    console.error("[households] recording last_sent_at failed:", sentError);
  }

  return res.status(created ? 201 : 200).json({ message: "Invitation sent" });
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

  const failure = await addToHousehold(user, row.household_id);
  if (failure) {
    return res.status(joinFailureStatus(failure)).json({ error: failure });
  }

  return res.status(200).json({ message: "Joined household successfully" });
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

async function requireHead(
  req: Request,
  res: Response,
  message: string
): Promise<boolean> {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const { data: household } = await db
    .from("households")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (!household || household.head_of_household_id !== user.id) {
    res.status(403).json({ error: message });
    return false;
  }
  return true;
}

async function listInvitationsHandler(req: Request, res: Response) {
  if (
    !(await requireHead(
      req,
      res,
      "Only the head of household can view invitations"
    ))
  ) {
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("household_invitations")
    .select("id, email, created_at, expires_at")
    .eq("household_id", req.params.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(200).json(data ?? []);
}

async function revokeInvitationHandler(req: Request, res: Response) {
  if (
    !(await requireHead(
      req,
      res,
      "Only the head of household can revoke invitations"
    ))
  ) {
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("household_invitations")
    .delete()
    .eq("id", req.params.invitationId)
    .eq("household_id", req.params.id)
    .eq("status", "pending")
    .select("id");

  if (error || !data?.length) {
    return res.status(404).json({ error: "Invitation not found" });
  }
  return res.status(204).send();
}

async function myInvitationsHandler(req: Request, res: Response) {
  const { user } = req as AuthenticatedRequest;
  if (!user.email) return res.status(200).json([]);

  const { data, error } = await supabaseAdmin
    .from("household_invitations")
    .select(
      "id, expires_at, households(name), inviter:profiles!invited_by(display_name)"
    )
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .eq("email", user.email.toLowerCase())
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    expires_at: string;
    households: { name: string } | null;
    inviter: { display_name: string } | null;
  }>;
  return res.status(200).json(
    rows.map((row) => ({
      id: row.id,
      household_name: row.households?.name ?? "",
      inviter_name: row.inviter?.display_name ?? "",
      expires_at: row.expires_at,
    }))
  );
}

// The caller's own pending invitation, or null. Missing, revoked, declined,
// someone else's and a wrong code all look the same, so invitations can't be probed.
async function findMyInvitation(req: Request) {
  const { user } = req as AuthenticatedRequest;
  const { data } = await supabaseAdmin
    .from("household_invitations")
    .select("id, household_id, email, status, code, expires_at")
    .eq("id", req.params.invitationId)
    .maybeSingle();

  // A bad or missing code looks exactly like a missing invitation
  const parsed = invitationCodeSchema.safeParse(req.body);
  if (
    !data ||
    !parsed.success ||
    !data.code ||
    normalizeInviteCode(parsed.data.code) !== data.code ||
    data.status !== "pending" ||
    !user.email ||
    data.email.toLowerCase() !== user.email.toLowerCase()
  ) {
    return null;
  }
  return data;
}

async function acceptInvitationHandler(req: Request, res: Response) {
  const { user } = req as AuthenticatedRequest;
  const invitation = await findMyInvitation(req);
  if (!invitation) {
    return res.status(404).json({ error: "Invitation not found" });
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return res.status(400).json({ error: "This invitation has expired" });
  }

  const failure = await addToHousehold(user, invitation.household_id);
  if (failure) {
    return res.status(joinFailureStatus(failure)).json({ error: failure });
  }

  await supabaseAdmin
    .from("household_invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id)
    .eq("status", "pending");

  return res.status(200).json({ message: "Joined household successfully" });
}

async function declineInvitationHandler(req: Request, res: Response) {
  const invitation = await findMyInvitation(req);
  if (!invitation) {
    return res.status(404).json({ error: "Invitation not found" });
  }

  await supabaseAdmin
    .from("household_invitations")
    .update({ status: "declined" })
    .eq("id", invitation.id)
    .eq("status", "pending");

  return res.status(204).send();
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

// Each invite sends an email, so cap how many a head can send.
const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => (req as AuthenticatedRequest).user.id,
  message: { error: "Too many invitations. Try again later." },
});

// Plan rule: creating a household and growing or editing it (invite, rotate
// the code, rename) need the caller on Pro; using it (own sharing, join,
// accept, household dashboard/reports) passes when the caller or the
// household's head is. Seeing the household and its pending invitations,
// leaving, deleting, transferring, removing members and revoking invitations
// work on any plan, so nobody is trapped by a downgrade.
const caller = requireHouseholdPlan("caller");
const callerOrHead = requireHouseholdPlan("callerOrHead");
const callerOrHeadOfParam = requireHouseholdPlan("callerOrHead", {
  target: "paramId",
});
const callerOrHeadOfCode = requireHouseholdPlan("callerOrHead", {
  target: "joinCode",
});
const callerOrHeadOfInvitation = requireHouseholdPlan("callerOrHead", {
  target: "invitation",
});

// ---------------------------------------------------------------------------
// Routes without household ID (resolve from user's profile)
// These MUST be registered before /:id routes to avoid path conflicts.
// ---------------------------------------------------------------------------
router.get("/", resolveHousehold, getHouseholdHandler);
router.post(
  "/",
  caller,
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
  callerOrHead,
  validate(updateSharingSchema),
  updateSharingHandler
);
router.post(
  "/invite",
  caller,
  inviteLimiter,
  resolveHousehold,
  validate(inviteToHouseholdSchema),
  inviteHandler
);
router.post(
  "/invite-code",
  caller,
  resolveHousehold,
  rotateInviteCodeHandler
);
router.patch(
  "/",
  caller,
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
// Invitation codes are guessable credentials, so cap failed attempts per user
// (accept and decline share the budget).
const invitationAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => (req as AuthenticatedRequest).user.id,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});
router.get("/invitations", resolveHousehold, listInvitationsHandler);
// The invitee routes act on the caller's own email, not a household. Listing
// and declining open no household, so they are allowed on any plan.
router.get("/invitations/mine", myInvitationsHandler);
router.post(
  "/invitations/:invitationId/accept",
  invitationAttemptLimiter,
  callerOrHeadOfInvitation,
  acceptInvitationHandler
);
router.post(
  "/invitations/:invitationId/decline",
  invitationAttemptLimiter,
  declineInvitationHandler
);
router.delete(
  "/invitations/:invitationId",
  resolveHousehold,
  revokeInvitationHandler
);
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
  callerOrHeadOfCode,
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
router.patch("/:id", caller, validate(renameHouseholdSchema), renameHandler);
router.delete(
  "/:id",
  validate(deleteHouseholdSchema),
  deleteHouseholdHandler
);
router.post(
  "/:id/invite",
  caller,
  inviteLimiter,
  validate(inviteToHouseholdSchema),
  inviteHandler
);
router.post("/:id/invite-code", caller, rotateInviteCodeHandler);
router.post(
  "/:id/join",
  joinByCodeLimiter,
  validate(joinHouseholdSchema),
  callerOrHeadOfParam,
  joinHandler
);
router.post(
  "/:id/transfer",
  validate(transferOwnershipSchema),
  transferOwnershipHandler
);
router.delete("/:id/members/:userId", removeMemberHandler);
router.put(
  "/:id/sharing",
  callerOrHeadOfParam,
  validate(updateSharingSchema),
  updateSharingHandler
);

export default router;
