import { Router, type Response } from "express";
import { updateProfileSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// ---------------------------------------------------------------------------
// GET / — get authenticated user's profile
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Profile not found" });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// PUT / — update profile fields
// ---------------------------------------------------------------------------
router.put("/", validate(updateProfileSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(req.body)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// PUT /onboarding — mark onboarding complete
// ---------------------------------------------------------------------------
router.put("/onboarding", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

export default router;
