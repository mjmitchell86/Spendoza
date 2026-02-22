import { Router, type Response } from "express";
import { createCategorySchema, updateCategorySchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { createSupabaseClient } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// ---------------------------------------------------------------------------
// GET / — list user's categories (system defaults + custom)
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { user, accessToken } = req as AuthenticatedRequest;
  const supabase = createSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST / — create custom category
// ---------------------------------------------------------------------------
router.post("/", validate(createCategorySchema), async (req, res: Response) => {
  const { user, accessToken } = req as AuthenticatedRequest;
  const supabase = createSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("categories")
    .insert({ ...req.body, user_id: user.id })
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// PUT /:id — update category (name, icon, is_shared_with_household)
// ---------------------------------------------------------------------------
router.put("/:id", validate(updateCategorySchema), async (req, res: Response) => {
  const { user, accessToken } = req as AuthenticatedRequest;
  const supabase = createSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("categories")
    .update(req.body)
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Category not found" });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete (only custom, not system defaults)
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res: Response) => {
  const { user, accessToken } = req as AuthenticatedRequest;
  const supabase = createSupabaseClient(accessToken);

  // First, look up the category to check if it's a system default
  const { data: category, error: lookupError } = await supabase
    .from("categories")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .single();

  if (lookupError || !category) {
    return res.status(404).json({ error: "Category not found" });
  }

  if (category.is_system_default) {
    return res.status(403).json({ error: "Cannot delete system default categories" });
  }

  const { error: deleteError } = await supabase
    .from("categories")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", user.id);

  if (deleteError) {
    return res.status(400).json({ error: deleteError.message });
  }

  return res.status(204).send();
});

export default router;
