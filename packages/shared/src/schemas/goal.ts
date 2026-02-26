import { z } from "zod";
import { entityTypeSchema } from "./report";

export const goalTypeSchema = z.enum([
  "budget",
  "monthly_savings",
  "total_savings",
]);
export type GoalType = z.infer<typeof goalTypeSchema>;

export const createGoalSchema = z.object({
  name: z.string().min(1).max(200),
  goal_type: goalTypeSchema,
  category_id: z.string().uuid().nullable().optional(),
  target_amount: z.number().positive(),
  target_date: z.string().date().nullable().optional(),
  entity_type: entityTypeSchema.optional(),
  entity_id: z.string().uuid().optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = createGoalSchema
  .omit({ entity_type: true, entity_id: true })
  .partial()
  .extend({
    current_amount: z.number().min(0).optional(),
  });

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export interface Goal {
  id: string;
  user_id: string;
  entity_type: "user" | "household";
  entity_id: string;
  name: string;
  goal_type: GoalType;
  category_id: string | null;
  target_amount: number;
  target_date: string | null;
  current_amount: number;
  created_at: string;
  updated_at: string;
}

export const goalSuggestionSchema = z.object({
  name: z.string(),
  goal_type: goalTypeSchema,
  category: z.string().nullable(),
  target_amount: z.number().positive(),
  rationale: z.string(),
});
export type GoalSuggestion = z.infer<typeof goalSuggestionSchema>;
