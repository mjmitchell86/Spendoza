import { Router, type Response } from "express";
import { createExpenseSchema, updateExpenseSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import type { AuthenticatedRequest } from "../middleware/auth";
import { toServiceContext } from "../services/context";
import { listExpenses, createExpense, updateExpense, deleteExpense } from "../services/expense.service";

const router = Router();

// ---------------------------------------------------------------------------
// GET / — list expenses (filterable by category, frequency, date range)
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { category_id, frequency, from_date, to_date } = req.query;
  const { data, error } = await listExpenses(ctx, {
    category_id: category_id as string | undefined,
    frequency: frequency as string | undefined,
    from_date: from_date as string | undefined,
    to_date: to_date as string | undefined,
  });
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST / — create expense
// ---------------------------------------------------------------------------
router.post("/", validate(createExpenseSchema), async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await createExpense(ctx, req.body);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// PUT /:id — update expense
// ---------------------------------------------------------------------------
router.put("/:id", validate(updateExpenseSchema), async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await updateExpense(ctx, req.params.id, req.body);
  if (error || !data) return res.status(404).json({ error: "Expense not found" });
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete expense
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { error } = await deleteExpense(ctx, req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(204).send();
});

export default router;
