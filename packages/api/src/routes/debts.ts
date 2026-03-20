import { Router, type Response } from "express";
import {
  createDebtSchema,
  updateDebtSchema,
  linkTransactionToDebtSchema,
} from "@spendoza/shared";
import { validate } from "../middleware/validate";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  projectSingleDebt,
  calculatePayoffStrategy,
} from "../services/debt-projection.service";
import { linkPaymentsToDebts } from "../services/debt-payment-linker.service";
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

// GET /debts/:id/payments — list transactions linked to a debt
router.get("/:id/payments", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  // Verify debt access
  const { data: debt } = await db
    .from("debts")
    .select("entity_type, entity_id")
    .eq("id", req.params.id)
    .single();

  if (!debt) return res.status(404).json({ error: "Debt not found" });

  if (debt.entity_type === "user" && debt.entity_id !== user!.id) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { data, error } = await db
    .from("transactions")
    .select("id, date, description, amount, bank_statement_id")
    .eq("matched_debt_id", req.params.id)
    .order("date", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /debts/link-transaction — link or unlink a transaction to a debt
router.post(
  "/link-transaction",
  validate(linkTransactionToDebtSchema),
  async (req, res: Response) => {
    const { user, supabase: db } = req as AuthenticatedRequest;
    const { transaction_id, debt_id, update_balance, new_balance } = req.body;

    // Verify transaction belongs to user
    const { data: txn } = await db
      .from("transactions")
      .select("id, amount")
      .eq("id", transaction_id)
      .eq("user_id", user!.id)
      .single();

    if (!txn) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // If linking (not unlinking), verify debt access
    if (debt_id) {
      const { data: debt } = await db
        .from("debts")
        .select("entity_type, entity_id")
        .eq("id", debt_id)
        .single();

      if (!debt) return res.status(404).json({ error: "Debt not found" });

      if (debt.entity_type === "user" && debt.entity_id !== user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // Update transaction link
    const { error: txnError } = await db
      .from("transactions")
      .update({ matched_debt_id: debt_id })
      .eq("id", transaction_id);

    if (txnError) {
      return res.status(500).json({ error: txnError.message });
    }

    // Optionally update debt balance
    if (update_balance && debt_id && new_balance !== undefined) {
      const { error: debtError } = await db
        .from("debts")
        .update({
          current_balance: new_balance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", debt_id);

      if (debtError) {
        return res.status(500).json({ error: debtError.message });
      }
    }

    return res.status(200).json({ linked: !!debt_id });
  }
);

// POST /debts/:id/auto-link — trigger auto-linking for this user
router.post("/:id/auto-link", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const linkedCount = await linkPaymentsToDebts(user!.id);
  res.json({ linked_count: linkedCount });
});

export default router;
