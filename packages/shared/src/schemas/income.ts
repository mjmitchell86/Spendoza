import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const frequencySchema = z.enum([
  "one_time",
  "weekly",
  "biweekly",
  "monthly",
  "annually",
]);

export type Frequency = z.infer<typeof frequencySchema>;

// ---------------------------------------------------------------------------
// Create income entry
// ---------------------------------------------------------------------------
export const createIncomeSchema = z.object({
  source_name: z.string().min(1).max(200),
  amount: z.number().positive(),
  frequency: frequencySchema,
  effective_date: z.string().date(),
  end_date: z.string().date().nullable().optional(),
  attributed_to_user_id: z.string().uuid().nullable().optional(),
  attributed_to_name: z.string().max(100).nullable().optional(),
});

export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;

// ---------------------------------------------------------------------------
// Update income entry
// ---------------------------------------------------------------------------
export const updateIncomeSchema = createIncomeSchema.partial();

export type UpdateIncomeInput = z.infer<typeof updateIncomeSchema>;

// ---------------------------------------------------------------------------
// Full income entry row
// ---------------------------------------------------------------------------
export interface IncomeEntry {
  id: string;
  user_id: string;
  attributed_to_user_id: string | null;
  attributed_to_name: string | null;
  source_name: string;
  amount: number;
  frequency: Frequency;
  effective_date: string;
  end_date: string | null;
  is_ai_suggested: boolean;
  bank_statement_id: string | null;
  created_at: string;
  updated_at: string;
}
