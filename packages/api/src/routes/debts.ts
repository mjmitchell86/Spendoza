import { Router, type Response } from "express";
import {
  createDebtSchema,
  updateDebtSchema,
  linkTransactionToDebtSchema,
} from "@spendoza/shared";
import { validate } from "../middleware/validate";
import type { AuthenticatedRequest } from "../middleware/auth";
import { toServiceContext } from "../services/context";
import {
  listDebts,
  createDebt,
  updateDebt,
  deleteDebt,
  getDebtProjections,
} from "../services/debt.service";
import { linkPaymentsToDebts } from "../services/debt-payment-linker.service";

const router = Router();

// ---------------------------------------------------------------------------
// GET /debts — list debts filtered by entity
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { data, error } = await listDebts(ctx, req.query.entity_type as string);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST /debts — create a debt
// ---------------------------------------------------------------------------
router.post(
  "/",
  validate(createDebtSchema),
  async (req, res: Response) => {
    const ctx = toServiceContext(req as AuthenticatedRequest);
    const { data, error } = await createDebt(ctx, req.body);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  }
);

// ---------------------------------------------------------------------------
// PUT /debts/:id — update a debt
// ---------------------------------------------------------------------------
router.put(
  "/:id",
  validate(updateDebtSchema),
  async (req, res: Response) => {
    const ctx = toServiceContext(req as AuthenticatedRequest);
    const { data, error } = await updateDebt(ctx, req.params.id, req.body);
    if (error) {
      const status = error.message === "Debt not found" ? 404
        : error.message === "Access denied" ? 403
        : 400;
      return res.status(status).json({ error: error.message });
    }
    return res.status(200).json(data);
  }
);

// ---------------------------------------------------------------------------
// DELETE /debts/:id — delete a debt
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const { error } = await deleteDebt(ctx, req.params.id);
  if (error) {
    const status = error.message === "Debt not found" ? 404
      : error.message === "Access denied" ? 403
      : 400;
    return res.status(status).json({ error: error.message });
  }
  return res.status(204).send();
});

// ---------------------------------------------------------------------------
// GET /debts/projections — debt payoff projections
// ---------------------------------------------------------------------------
router.get("/projections", async (req, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const extraPayment = Number(req.query.extra_payment) || 0;
  const { data, error } = await getDebtProjections(
    ctx,
    req.query.entity_type as string,
    extraPayment
  );
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// GET /debts/:id/payments — list transactions linked to a debt
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /debts/link-transaction — link or unlink a transaction to a debt
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /debts/:id/auto-link — trigger auto-linking for this user
// ---------------------------------------------------------------------------
router.post("/:id/auto-link", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const linkedCount = await linkPaymentsToDebts(user!.id);
  res.json({ linked_count: linkedCount });
});

export default router;
