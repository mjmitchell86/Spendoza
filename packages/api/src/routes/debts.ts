import { Router, type Response } from "express";
import { createDebtSchema, updateDebtSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  projectSingleDebt,
  calculatePayoffStrategy,
} from "../services/debt-projection.service";
import type { Debt } from "@spendoza/shared";

const router = Router();

async function resolveEntity(
  db: any,
  user: { id: string },
  entityTypeParam: string | undefined
): Promise<
  { entityType: "user" | "household"; entityId: string } | { error: string }
> {
  const entityType = entityTypeParam === "household" ? "household" : "user";
  if (entityType === "user") {
    return { entityType, entityId: user.id };
  }
  const { data: profile } = await db
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();
  if (!profile?.household_id) {
    return { error: "You are not a member of any household" };
  }
  return { entityType, entityId: profile.household_id };
}

// GET /debts
router.get("/", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const entity = await resolveEntity(db, user!, req.query.entity_type as string);
  if ("error" in entity) return res.status(400).json({ error: entity.error });

  const { data, error } = await db
    .from("debts")
    .select("*")
    .eq("entity_type", entity.entityType)
    .eq("entity_id", entity.entityId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /debts
router.post(
  "/",
  validate(createDebtSchema),
  async (req, res: Response) => {
    const { user, supabase: db } = req as AuthenticatedRequest;
    const entity = await resolveEntity(db, user!, req.body.entity_type);
    if ("error" in entity) return res.status(400).json({ error: entity.error });

    const { data, error } = await db
      .from("debts")
      .insert({
        user_id: user!.id,
        entity_type: entity.entityType,
        entity_id: entity.entityId,
        name: req.body.name,
        debt_type: req.body.debt_type,
        original_balance: req.body.original_balance,
        current_balance: req.body.current_balance,
        interest_rate: req.body.interest_rate ?? 0,
        minimum_payment: req.body.minimum_payment ?? 0,
        due_date_day: req.body.due_date_day ?? null,
        linked_category_id: req.body.linked_category_id ?? null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  }
);

// PUT /debts/:id
router.put(
  "/:id",
  validate(updateDebtSchema),
  async (req, res: Response) => {
    const { user, supabase: db } = req as AuthenticatedRequest;
    const { data: existing } = await db
      .from("debts")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (!existing) return res.status(404).json({ error: "Debt not found" });

    if (existing.entity_type === "user" && existing.entity_id !== user!.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (existing.entity_type === "household") {
      const { data: profile } = await db
        .from("profiles")
        .select("household_id")
        .eq("id", user!.id)
        .single();
      if (profile?.household_id !== existing.entity_id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const { data, error } = await db
      .from("debts")
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  }
);

// DELETE /debts/:id
router.delete("/:id", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const { data: existing } = await db
    .from("debts")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (!existing) return res.status(404).json({ error: "Debt not found" });

  if (existing.entity_type === "user" && existing.entity_id !== user!.id) {
    return res.status(403).json({ error: "Access denied" });
  }
  if (existing.entity_type === "household") {
    const { data: profile } = await db
      .from("profiles")
      .select("household_id")
      .eq("id", user!.id)
      .single();
    if (profile?.household_id !== existing.entity_id) {
      return res.status(403).json({ error: "Access denied" });
    }
  }

  const { error } = await db
    .from("debts")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// GET /debts/projections
router.get("/projections", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const entity = await resolveEntity(db, user!, req.query.entity_type as string);
  if ("error" in entity) return res.status(400).json({ error: entity.error });

  const extraPayment = Number(req.query.extra_payment) || 0;

  const { data: debts, error } = await db
    .from("debts")
    .select("*")
    .eq("entity_type", entity.entityType)
    .eq("entity_id", entity.entityId)
    .gt("current_balance", 0)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const individual = (debts as Debt[]).map(projectSingleDebt);
  const avalanche = calculatePayoffStrategy(debts as Debt[], extraPayment, "avalanche");
  const snowball = calculatePayoffStrategy(debts as Debt[], extraPayment, "snowball");

  res.json({ individual, avalanche, snowball });
});

export default router;
