import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const transactionTypeSchema = z.enum(["credit", "debit"]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

// ---------------------------------------------------------------------------
// Update transaction
// ---------------------------------------------------------------------------
export const updateTransactionSchema = z.object({
  ai_category: z.string().nullable().optional(),
  matched_expense_id: z.string().uuid().nullable().optional(),
  matched_income_id: z.string().uuid().nullable().optional(),
  matched_debt_id: z.string().uuid().nullable().optional(),
});

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

// ---------------------------------------------------------------------------
// Attribute transaction to a user
// ---------------------------------------------------------------------------
export const attributeTransactionSchema = z.object({
  attributed_to_user_id: z.string().uuid(),
});

export type AttributeTransactionInput = z.infer<
  typeof attributeTransactionSchema
>;

// ---------------------------------------------------------------------------
// Bulk attribute transactions
// ---------------------------------------------------------------------------
export const bulkAttributeTransactionsSchema = z.object({
  attributions: z.array(
    z.object({
      transaction_id: z.string().uuid(),
      attributed_to_user_id: z.string().uuid(),
    })
  ),
});

export type BulkAttributeTransactionsInput = z.infer<
  typeof bulkAttributeTransactionsSchema
>;

// ---------------------------------------------------------------------------
// Full transaction row
// ---------------------------------------------------------------------------
export interface Transaction {
  id: string;
  bank_statement_id: string;
  user_id: string;
  attributed_to_user_id: string | null;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  ai_category: string | null;
  matched_expense_id: string | null;
  matched_income_id: string | null;
  matched_debt_id: string | null;
  created_at: string;
}
