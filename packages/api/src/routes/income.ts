import { Router, type Response } from "express";
import { createIncomeSchema, updateIncomeSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// ---------------------------------------------------------------------------
// GET / — list income entries (owned by user OR attributed to user)
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("income_entries")
    .select("*")
    .or(`user_id.eq.${user.id},attributed_to_user_id.eq.${user.id}`)
    .order("effective_date", { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST / — create income entry
// ---------------------------------------------------------------------------
router.post("/", validate(createIncomeSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  // If attributed_to_user_id is provided, validate household membership
  if (req.body.attributed_to_user_id) {
    const { data: currentProfile } = await supabaseAdmin
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    const { data: attributedProfile } = await supabaseAdmin
      .from("profiles")
      .select("household_id")
      .eq("id", req.body.attributed_to_user_id)
      .single();

    if (
      !currentProfile?.household_id ||
      !attributedProfile?.household_id ||
      currentProfile.household_id !== attributedProfile.household_id
    ) {
      return res.status(403).json({ error: "Attributed user is not in your household" });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("income_entries")
    .insert({ ...req.body, user_id: user.id })
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// PUT /:id — update income entry (RLS allows owner and attributed user)
// ---------------------------------------------------------------------------
router.put("/:id", validate(updateIncomeSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("income_entries")
    .update(req.body)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Income entry not found" });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete income entry (only owner, not attributed user)
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { error } = await supabaseAdmin
    .from("income_entries")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", user.id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(204).send();
});

export default router;
