import { z } from "zod";
import { entityTypeSchema } from "./report";

export const debtTypeSchema = z.enum([
  "credit_card",
  "student_loan",
  "mortgage",
  "auto_loan",
  "personal_loan",
  "medical",
  "other",
]);
export type DebtType = z.infer<typeof debtTypeSchema>;

export const createDebtSchema = z.object({
  name: z.string().min(1).max(200),
  debt_type: debtTypeSchema,
  original_balance: z.number().positive(),
  current_balance: z.number().min(0),
  interest_rate: z.number().min(0).default(0),
  minimum_payment: z.number().min(0).default(0),
  due_date_day: z.number().int().min(1).max(31).nullable().optional(),
  linked_category_id: z.string().uuid().nullable().optional(),
  entity_type: entityTypeSchema.optional(),
  entity_id: z.string().uuid().optional(),
});
export type CreateDebtInput = z.infer<typeof createDebtSchema>;

export const updateDebtSchema = createDebtSchema
  .omit({ entity_type: true, entity_id: true })
  .partial();
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;

export interface Debt {
  id: string;
  user_id: string;
  entity_type: "user" | "household";
  entity_id: string;
  name: string;
  debt_type: DebtType;
  original_balance: number;
  current_balance: number;
  interest_rate: number;
  minimum_payment: number;
  due_date_day: number | null;
  linked_category_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DebtProjection {
  debt_id: string;
  debt_name: string;
  current_balance: number;
  interest_rate: number;
  minimum_payment: number;
  months_to_payoff: number;
  total_interest: number;
  payoff_date: string;
}

// ---------------------------------------------------------------------------
// Link transaction to debt
// ---------------------------------------------------------------------------
export const linkTransactionToDebtSchema = z.object({
  transaction_id: z.string().uuid(),
  debt_id: z.string().uuid().nullable(),
  update_balance: z.boolean().optional().default(false),
  new_balance: z.number().min(0).optional(),
});
export type LinkTransactionToDebtInput = z.infer<typeof linkTransactionToDebtSchema>;

// ---------------------------------------------------------------------------
// Debt payment (returned from API)
// ---------------------------------------------------------------------------
export interface DebtPayment {
  id: string;
  date: string;
  description: string;
  amount: number;
  bank_statement_id: string;
}

export interface DebtPayoffStrategy {
  strategy: "avalanche" | "snowball";
  debts: DebtProjection[];
  total_months: number;
  total_interest: number;
}
