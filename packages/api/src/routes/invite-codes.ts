import { Router, type Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { generateInviteCode } from "../services/household.service";

const router = Router();

const MAX_CODES_PER_USER = 3;

// ---------------------------------------------------------------------------
// GET / — list current user's invite codes
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  const { data, error } = await db
    .from("invite_codes")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST / — generate a new invite code (max 3 per user)
// ---------------------------------------------------------------------------
router.post("/", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const userId = user.id;

  // Check count
  const { count, error: countError } = await db
    .from("invite_codes")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId);

  if (countError) {
    return res.status(500).json({ error: countError.message });
  }

  if ((count ?? 0) >= MAX_CODES_PER_USER) {
    return res.status(400).json({ error: `Maximum of ${MAX_CODES_PER_USER} invite codes allowed` });
  }

  const code = generateInviteCode();

  const { data, error } = await db
    .from("invite_codes")
    .insert({ code, created_by: userId })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
});

export default router;
