import { Router, type Response } from "express";
import { createCategorySchema, updateCategorySchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import type { AuthenticatedRequest } from "../middleware/auth";
import { toServiceContext } from "../services/context";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../services/category.service";

const router = Router();

// ---------------------------------------------------------------------------
// GET / — list user's categories (system defaults + custom)
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await listCategories(ctx);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST / — create custom category
// ---------------------------------------------------------------------------
router.post("/", validate(createCategorySchema), async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await createCategory(ctx, req.body);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// PUT /:id — update category (name, icon, is_shared_with_household)
// ---------------------------------------------------------------------------
router.put("/:id", validate(updateCategorySchema), async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await updateCategory(ctx, req.params.id, req.body);
  if (error || !data) return res.status(404).json({ error: "Category not found" });
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete (only custom, not system defaults)
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { error } = await deleteCategory(ctx, req.params.id);
  if (!error) return res.status(204).send();
  if ((error as any).status === 403) return res.status(403).json({ error: error.message });
  if (error.message === "Category not found") return res.status(404).json({ error: error.message });
  return res.status(400).json({ error: error.message });
});

export default router;
