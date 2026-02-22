import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const incomeSharingModeSchema = z.enum(["all", "none", "partial"]);
export type IncomeSharingMode = z.infer<typeof incomeSharingModeSchema>;

export const expenseSharingModeSchema = z.enum(["all", "none", "category"]);
export type ExpenseSharingMode = z.infer<typeof expenseSharingModeSchema>;

// ---------------------------------------------------------------------------
// Update profile (API input)
// ---------------------------------------------------------------------------
export const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  income_sharing_mode: incomeSharingModeSchema.optional(),
  shared_income_amount: z.number().positive().nullable().optional(),
  expense_sharing_mode: expenseSharingModeSchema.optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ---------------------------------------------------------------------------
// Full profile row
// ---------------------------------------------------------------------------
export interface Profile {
  id: string;
  display_name: string;
  onboarding_completed: boolean;
  household_id: string | null;
  income_sharing_mode: IncomeSharingMode;
  shared_income_amount: number | null;
  expense_sharing_mode: ExpenseSharingMode;
  created_at: string;
  updated_at: string;
}
