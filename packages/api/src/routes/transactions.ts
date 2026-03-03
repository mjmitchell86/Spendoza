import { Router, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  updateTransactionSchema,
  attributeTransactionSchema,
  bulkAttributeTransactionsSchema,
} from "@spendoza/shared";
import { validate } from "../middleware/validate";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// ---------------------------------------------------------------------------
// GET / — list transactions (filterable)
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  let query = db
    .from("transactions")
    .select("*")
    .eq("user_id", user.id);

  // Optional filters
  const { bank_statement_id, from_date, to_date, type } = req.query;

  if (bank_statement_id) {
    query = query.eq("bank_statement_id", bank_statement_id as string);
  }

  if (from_date) {
    query = query.gte("date", from_date as string);
  }

  if (to_date) {
    query = query.lte("date", to_date as string);
  }

  if (type) {
    query = query.eq("type", type as string);
  }

  const { data, error } = await query.order("date", { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// PUT /:id — update category override, matched expense/income
// ---------------------------------------------------------------------------
router.put(
  "/:id",
  validate(updateTransactionSchema),
  async (req, res: Response) => {
    const { user, supabase: db } = req as AuthenticatedRequest;

    const { data, error } = await db
      .from("transactions")
      .update(req.body)
      .eq("id", req.params.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    return res.status(200).json(data);
  }
);

// ---------------------------------------------------------------------------
// Attribution validation helper
// ---------------------------------------------------------------------------
async function validateAttribution(
  db: SupabaseClient,
  transactionId: string,
  attributedToUserId: string,
  requesterId: string
): Promise<{ error?: string }> {
  // 1. Fetch the transaction
  const { data: transaction, error: txnError } = await db
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("user_id", requesterId)
    .single();

  if (txnError || !transaction) {
    return { error: "Transaction not found" };
  }

  // 2. Fetch the bank statement and check is_shared_account
  const { data: statement, error: stmtError } = await db
    .from("bank_statements")
    .select("*")
    .eq("id", transaction.bank_statement_id)
    .single();

  if (stmtError || !statement) {
    return { error: "Bank statement not found" };
  }

  if (!statement.is_shared_account) {
    return { error: "Attribution is only allowed for shared account statements" };
  }

  // 3. Check the target user is in the same household as the requester
  const { data: targetProfile, error: targetError } = await db
    .from("profiles")
    .select("*")
    .eq("id", attributedToUserId)
    .single();

  if (targetError || !targetProfile) {
    return { error: "Target user not found" };
  }

  const { data: requesterProfile, error: reqError } = await db
    .from("profiles")
    .select("*")
    .eq("id", requesterId)
    .single();

  if (reqError || !requesterProfile) {
    return { error: "Requester profile not found" };
  }

  if (
    !targetProfile.household_id ||
    !requesterProfile.household_id ||
    targetProfile.household_id !== requesterProfile.household_id
  ) {
    return { error: "Target user is not in the same household" };
  }

  // 4. Requester must be uploader of the statement OR head of household
  const isUploader = statement.user_id === requesterId;

  let isHead = false;
  if (!isUploader && requesterProfile.household_id) {
    const { data: household } = await db
      .from("households")
      .select("head_of_household_id")
      .eq("id", requesterProfile.household_id)
      .single();
    isHead = household?.head_of_household_id === requesterId;
  }

  if (!isUploader && !isHead) {
    return { error: "Only the statement uploader or head of household can attribute transactions" };
  }

  return {};
}

// ---------------------------------------------------------------------------
// PUT /:id/attribute — assign transaction to a household member
// ---------------------------------------------------------------------------
router.put(
  "/:id/attribute",
  validate(attributeTransactionSchema),
  async (req, res: Response) => {
    const { user, supabase: db } = req as AuthenticatedRequest;
    const { attributed_to_user_id } = req.body;

    const validation = await validateAttribution(
      db,
      req.params.id,
      attributed_to_user_id,
      user.id
    );

    if (validation.error) {
      return res.status(403).json({ error: validation.error });
    }

    const { data, error } = await db
      .from("transactions")
      .update({ attributed_to_user_id })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(400).json({ error: "Failed to attribute transaction" });
    }

    return res.status(200).json(data);
  }
);

// ---------------------------------------------------------------------------
// POST /bulk-attribute — bulk assign transactions
// ---------------------------------------------------------------------------
router.post(
  "/bulk-attribute",
  validate(bulkAttributeTransactionsSchema),
  async (req, res: Response) => {
    const { user, supabase: db } = req as AuthenticatedRequest;
    const { attributions } = req.body;

    const results = [];

    for (const attribution of attributions) {
      const { transaction_id, attributed_to_user_id } = attribution;

      const validation = await validateAttribution(
        db,
        transaction_id,
        attributed_to_user_id,
        user.id
      );

      if (validation.error) {
        results.push({
          transaction_id,
          success: false,
          error: validation.error,
        });
        continue;
      }

      const { data, error } = await db
        .from("transactions")
        .update({ attributed_to_user_id })
        .eq("id", transaction_id)
        .select()
        .single();

      if (error || !data) {
        results.push({
          transaction_id,
          success: false,
          error: "Failed to update transaction",
        });
      } else {
        results.push({
          transaction_id,
          success: true,
        });
      }
    }

    return res.status(200).json({ results });
  }
);

export default router;
