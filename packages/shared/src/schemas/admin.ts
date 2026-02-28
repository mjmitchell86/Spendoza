import { z } from "zod";
import { subscriptionTierSchema } from "./subscription";

// ---------------------------------------------------------------------------
// Admin stats (GET /api/admin/stats response)
// ---------------------------------------------------------------------------
export const adminUserStatsSchema = z.object({
  total_users: z.number(),
  free_users: z.number(),
  starter_users: z.number(),
  pro_users: z.number(),
  admin_users: z.number(),
});
export type AdminUserStats = z.infer<typeof adminUserStatsSchema>;

export const adminActivityStatsSchema = z.object({
  total_transactions: z.number(),
  total_reports: z.number(),
  total_emails_sent: z.number(),
  total_goals: z.number(),
  total_households: z.number(),
});
export type AdminActivityStats = z.infer<typeof adminActivityStatsSchema>;

export const adminStatsResponseSchema = z.object({
  users: adminUserStatsSchema,
  activity: adminActivityStatsSchema,
});
export type AdminStatsResponse = z.infer<typeof adminStatsResponseSchema>;

// ---------------------------------------------------------------------------
// Admin trends (GET /api/admin/stats/trends response)
// ---------------------------------------------------------------------------
export const adminTrendsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});
export type AdminTrendsQuery = z.infer<typeof adminTrendsQuerySchema>;

export const adminUserTrendSchema = z.object({
  month: z.string(),
  new_users: z.number(),
});

export const adminActivityTrendSchema = z.object({
  month: z.string(),
  metric: z.string(),
  count: z.number(),
});

export const adminLlmStatSchema = z.object({
  month: z.string(),
  call_type: z.string(),
  call_count: z.number(),
  total_tokens: z.number(),
  avg_tokens: z.number(),
  min_tokens: z.number(),
  max_tokens: z.number(),
  total_cost: z.number().nullable(),
});

export const adminTrendsResponseSchema = z.object({
  user_trends: z.array(adminUserTrendSchema),
  activity_trends: z.array(adminActivityTrendSchema),
  llm_stats: z.array(adminLlmStatSchema),
});
export type AdminTrendsResponse = z.infer<typeof adminTrendsResponseSchema>;

// ---------------------------------------------------------------------------
// Admin user list (GET /api/admin/users)
// ---------------------------------------------------------------------------
export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  tier: subscriptionTierSchema.optional(),
  is_admin: z.coerce.boolean().optional(),
  disabled: z.coerce.boolean().optional(),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export interface AdminUserRow {
  id: string;
  display_name: string;
  email: string;
  subscription_tier: string;
  is_admin: boolean;
  disabled: boolean;
  created_at: string;
}

export const adminUsersResponseSchema = z.object({
  users: z.array(z.object({
    id: z.string(),
    display_name: z.string(),
    email: z.string(),
    subscription_tier: z.string(),
    is_admin: z.boolean(),
    disabled: z.boolean(),
    created_at: z.string(),
  })),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;

// ---------------------------------------------------------------------------
// Admin update user (PATCH /api/admin/users/:id)
// ---------------------------------------------------------------------------
export const adminUpdateUserSchema = z.object({
  is_admin: z.boolean().optional(),
  subscription_tier: subscriptionTierSchema.optional(),
  disabled: z.boolean().optional(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

// ---------------------------------------------------------------------------
// LLM usage log entry (for AI pipeline integration)
// ---------------------------------------------------------------------------
export const llmUsageLogSchema = z.object({
  user_id: z.string().uuid().nullable(),
  call_type: z.string(),
  model: z.string(),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  total_tokens: z.number().int().min(0),
  cost_estimate: z.number().nullable().optional(),
});
export type LlmUsageLogInput = z.infer<typeof llmUsageLogSchema>;
