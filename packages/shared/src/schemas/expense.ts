import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const expenseFrequencySchema = z.enum(["one_time", "recurring"]);
export type ExpenseFrequency = z.infer<typeof expenseFrequencySchema>;

export const recurrenceIntervalSchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annually",
]);
export type RecurrenceInterval = z.infer<typeof recurrenceIntervalSchema>;

// ---------------------------------------------------------------------------
// Create expense
// ---------------------------------------------------------------------------
export const createExpenseSchema = z.object({
  category_id: z.string().uuid(),
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
  frequency: expenseFrequencySchema,
  recurrence_interval: recurrenceIntervalSchema.nullable().optional(),
  next_due_date: z.string().date(),
  end_date: z.string().date().nullable().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

// ---------------------------------------------------------------------------
// Update expense
// ---------------------------------------------------------------------------
export const updateExpenseSchema = createExpenseSchema.partial();

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

// ---------------------------------------------------------------------------
// Full expense row
// ---------------------------------------------------------------------------
export interface Expense {
  id: string;
  user_id: string;
  category_id: string;
  description: string;
  amount: number;
  frequency: ExpenseFrequency;
  recurrence_interval: RecurrenceInterval | null;
  next_due_date: string;
  end_date: string | null;
  is_ai_adjusted: boolean;
  original_amount: number | null;
  bank_statement_id: string | null;
  auto_detected: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}
