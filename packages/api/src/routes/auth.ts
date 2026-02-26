import { Router, type Request, type Response } from "express";
import { signupSchema, loginSchema, waitlistSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

const ADMIN_INVITE_CODE = "Chloe14";

// ---------------------------------------------------------------------------
// POST /signup
// ---------------------------------------------------------------------------
router.post("/signup", validate(signupSchema), async (req: Request, res: Response) => {
  const { email, password, display_name, invite_code } = req.body;

  // Validate invite code: check hardcoded admin code first, then DB
  let dbCodeId: string | null = null;

  if (invite_code !== ADMIN_INVITE_CODE) {
    const { data: codeRecord, error: codeError } = await supabaseAdmin
      .from("invite_codes")
      .select("id")
      .eq("code", invite_code)
      .is("used_by", null)
      .single();

    if (codeError || !codeRecord) {
      return res.status(400).json({ error: "Invalid or already-used invite code" });
    }

    dbCodeId = codeRecord.id;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name },
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // Mark DB invite code as used (skip for admin code)
  if (dbCodeId) {
    await supabaseAdmin
      .from("invite_codes")
      .update({ used_by: data.user.id, used_at: new Date().toISOString() })
      .eq("id", dbCodeId);
  }

  return res.status(201).json({ user: data.user });
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
