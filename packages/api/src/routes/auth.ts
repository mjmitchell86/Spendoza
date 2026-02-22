import { Router, type Request, type Response } from "express";
import { signupSchema, loginSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

// ---------------------------------------------------------------------------
// POST /signup
// ---------------------------------------------------------------------------
router.post("/signup", validate(signupSchema), async (req: Request, res: Response) => {
  const { email, password, display_name } = req.body;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name },
  });

  if (error) {
    return res.status(400).json({ error: error.message });
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
