import { Router, type Response } from "express";
import { createExpenseSchema, updateExpenseSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// ---------------------------------------------------------------------------
// GET / — list expenses (filterable by category, frequency, date range)
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  let query = db
    .from("expenses")
    .select("*")
    .eq("user_id", user.id);

  // Optional filters
  const { category_id, frequency, from_date, to_date } = req.query;

  if (category_id) {
    query = query.eq("category_id", category_id as string);
  }

  if (frequency) {
    query = query.eq("frequency", frequency as string);
  }

  if (from_date) {
    query = query.gte("next_due_date", from_date as string);
  }

  if (to_date) {
    query = query.lte("next_due_date", to_date as string);
  }

  // Exclude expired bills (end_date in the past)
  query = query.or("end_date.is.null,end_date.gte." + new Date().toISOString().slice(0, 10));

  const { data, error } = await query.order("next_due_date", { ascending: true });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST / — create expense
// ---------------------------------------------------------------------------
router.post("/", validate(createExpenseSchema), async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  const { data, error } = await db
    .from("expenses")
    .insert({ ...req.body, user_id: user.id })
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// PUT /:id — update expense
// ---------------------------------------------------------------------------
router.put("/:id", validate(updateExpenseSchema), async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  const { data, error } = await db
    .from("expenses")
    .update(req.body)
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Expense not found" });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete expense
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  const { error } = await db
    .from("expenses")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", user.id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(204).send();
});

export default router;
