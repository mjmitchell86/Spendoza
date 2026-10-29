import { Router, type Request, type Response } from "express";
import {
  signupSchema,
  loginSchema,
  waitlistSchema,
  normalizeInviteCode,
} from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { householdHeadOnPro } from "../middleware/require-household-plan";
import { supabaseAdmin } from "../lib/supabase";
import {
  addToHousehold,
  HOUSEHOLD_FULL_MESSAGE,
} from "../services/household-membership.service";

const INVALID_CODE_ERROR = "Invalid or already-used invite code";

const router = Router();

// ---------------------------------------------------------------------------
// POST /signup
// ---------------------------------------------------------------------------
router.post("/signup", validate(signupSchema), async (req: Request, res: Response) => {
  const { email, password, display_name, invite_code } = req.body;

  const invalidCode = () => {
    console.error("Signup failed: invalid invite code");
    return res.status(400).json({ error: INVALID_CODE_ERROR });
  };

  // A sign-up invite code (unchanged behaviour)...
  const { data: codeRecord } = await supabaseAdmin
    .from("invite_codes")
    .select("id")
    .eq("code", invite_code)
    .is("used_by", null)
    .single();

  // ...or the code from a household invitation email, which only works for
  // the invited address. Any miss looks the same as a bad sign-up code.
  let invitation: { id: string; household_id: string } | null = null;
  if (!codeRecord) {
    const { data } = await supabaseAdmin
      .from("household_invitations")
      .select("id, household_id")
      .eq("code", normalizeInviteCode(invite_code))
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .eq("email", String(email).toLowerCase())
      .single();
    invitation = data ?? null;
  }

  if (!codeRecord && !invitation) {
    return invalidCode();
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name },
  });

  if (error) {
    console.error(`Signup createUser failed for ${email}: ${error.message}`);
    return res.status(400).json({ error: error.message });
  }

  if (codeRecord) {
    // Mark the invite code as used
    await supabaseAdmin
      .from("invite_codes")
      .update({ used_by: data.user.id, used_at: new Date().toISOString() })
      .eq("id", codeRecord.id);

    return res.status(201).json({ user: data.user, joined_household: false });
  }

  // Household invitation: join unless the household's head is off Pro or the
  // household is full (the account is still created; the invitation stays pending)
  if (!(await householdHeadOnPro(invitation!.household_id))) {
    return res.status(201).json({
      user: data.user,
      joined_household: false,
      household_not_on_plan: true,
    });
  }

  const failure = await addToHousehold(
    { id: data.user.id, email: data.user.email ?? email },
    invitation!.household_id
  );
  if (failure) {
    return res.status(201).json({
      user: data.user,
      joined_household: false,
      ...(failure === HOUSEHOLD_FULL_MESSAGE ? { household_full: true } : {}),
    });
  }

  await supabaseAdmin
    .from("household_invitations")
    .update({ status: "accepted" })
    .eq("id", invitation!.id)
    .eq("status", "pending");

  return res.status(201).json({ user: data.user, joined_household: true });
});

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------
router.post("/login", validate(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.status(200).json({ session: data.session, user: data.user });
});

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------
router.post("/logout", (_req: Request, res: Response) => {
  return res.status(200).json({ message: "Logged out" });
});

// ---------------------------------------------------------------------------
// POST /waitlist
// ---------------------------------------------------------------------------
router.post("/waitlist", validate(waitlistSchema), async (req: Request, res: Response) => {
  const { name, email } = req.body;

  // Extract IP from Vercel's x-forwarded-for header
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : req.socket.remoteAddress ?? null;

  // Resolve geography from IP (non-blocking — save record even if this fails)
  let geo: { country?: string; regionName?: string; city?: string } = {};
  if (ip && ip !== "127.0.0.1" && ip !== "::1") {
    try {
      const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=country,regionName,city`);
      if (geoRes.ok) {
        geo = await geoRes.json();
      }
    } catch {
      // Geo lookup failed — continue without it
    }
  }

  const { error } = await supabaseAdmin
    .from("waitlist")
    .insert({
      name,
      email: email.toLowerCase(),
      ip_address: ip,
      country: geo.country ?? null,
      region: geo.regionName ?? null,
      city: geo.city ?? null,
    });

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "This email is already on the waitlist" });
    }
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({ message: "You've been added to the waitlist!" });
});

export default router;
