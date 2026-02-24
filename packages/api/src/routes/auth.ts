import { Router, type Request, type Response } from "express";
import { signupSchema, loginSchema } from "@spendoza/shared";
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

export default router;
