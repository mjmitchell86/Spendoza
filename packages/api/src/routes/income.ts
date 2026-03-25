import { Router, type Response } from "express";
import { createIncomeSchema, updateIncomeSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import type { AuthenticatedRequest } from "../middleware/auth";
import { toServiceContext } from "../services/context";
import { listIncome, createIncome, updateIncome, deleteIncome } from "../services/income.service";

const router = Router();

// ---------------------------------------------------------------------------
// GET / — list income entries (owned by user OR attributed to user)
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await listIncome(ctx);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST / — create income entry
// ---------------------------------------------------------------------------
router.post("/", validate(createIncomeSchema), async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await createIncome(ctx, req.body);
  if (error) return res.status(403).json({ error: error.message });
  return res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// PUT /:id — update income entry (RLS allows owner and attributed user)
// ---------------------------------------------------------------------------
router.put("/:id", validate(updateIncomeSchema), async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await updateIncome(ctx, req.params.id, req.body);
  if (error || !data) return res.status(404).json({ error: "Income entry not found" });
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete income entry (only owner, not attributed user)
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { error } = await deleteIncome(ctx, req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(204).send();
});

export default router;
