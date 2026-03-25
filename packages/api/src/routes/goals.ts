import { Router, type Response } from "express";
import { createGoalSchema, updateGoalSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import type { AuthenticatedRequest } from "../middleware/auth";
import { toServiceContext } from "../services/context";
import {
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  getGoalSuggestions,
  getGoalProgress,
} from "../services/goal.service";

const router = Router();

// ---------------------------------------------------------------------------
// GET /suggestions — AI-suggested goals based on latest report data
// ---------------------------------------------------------------------------
router.get("/suggestions", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await getGoalSuggestions(ctx, req.query.entity_type as string);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// GET / — list goals filtered by entity
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await listGoals(ctx, req.query.entity_type as string);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST / — create a goal
// ---------------------------------------------------------------------------
router.post("/", validate(createGoalSchema), async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await createGoal(ctx, req.body);
  if (error) return res.status(403).json({ error: error.message });
  return res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// PUT /:id — update a goal
// ---------------------------------------------------------------------------
router.put("/:id", validate(updateGoalSchema), async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await updateGoal(ctx, req.params.id, req.body);
  if (error) {
    const status = error.message === "Goal not found" ? 404
      : error.message === "Forbidden" ? 403
      : 400;
    return res.status(status).json({ error: error.message });
  }
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete a goal
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { error } = await deleteGoal(ctx, req.params.id);
  if (error) {
    const status = error.message === "Goal not found" ? 404
      : error.message === "Forbidden" ? 403
      : 400;
    return res.status(status).json({ error: error.message });
  }
  return res.status(204).send();
});

// ---------------------------------------------------------------------------
// GET /progress — progress for goals with historical data
// ---------------------------------------------------------------------------
router.get("/progress", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const months = Math.min(parseInt(req.query.months as string) || 6, 24);
  const { data, error } = await getGoalProgress(
    ctx,
    req.query.entity_type as string,
    months
  );
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json(data);
});

export default router;
