import { z } from "zod";

// ---------------------------------------------------------------------------
// Create category
// ---------------------------------------------------------------------------
export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().nullable().optional(),
  is_shared_with_household: z.boolean().optional().default(false),
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
  created_at: string;
}
