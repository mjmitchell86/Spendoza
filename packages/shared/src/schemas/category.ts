import { z } from "zod";

// ---------------------------------------------------------------------------
// Budget class enum
// ---------------------------------------------------------------------------
export const budgetClassSchema = z.enum(["need", "want", "savings", "other"]);
export type BudgetClass = z.infer<typeof budgetClassSchema>;

// ---------------------------------------------------------------------------
// Create category
// ---------------------------------------------------------------------------
export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().nullable().optional(),
  is_shared_with_household: z.boolean().optional().default(false),
  budget_class: budgetClassSchema.optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// ---------------------------------------------------------------------------
// Update category
// ---------------------------------------------------------------------------
export const updateCategorySchema = createCategorySchema.partial();

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ---------------------------------------------------------------------------
// Full category row
// ---------------------------------------------------------------------------
export interface Category {
  id: string;
  user_id: string;
  name: string;
  is_shared_with_household: boolean;
  is_system_default: boolean;
  icon: string | null;
  budget_class: BudgetClass;
  created_at: string;
}
