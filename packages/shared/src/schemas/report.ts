import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const entityTypeSchema = z.enum(["user", "household"]);
export type EntityType = z.infer<typeof entityTypeSchema>;

// ---------------------------------------------------------------------------
// Full report row
// ---------------------------------------------------------------------------
export interface Report {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  report_month: string;
  report_data: unknown;
  ai_insights: string | null;
  generated_at: string;
  has_new_data: boolean;
}

// ---------------------------------------------------------------------------
// Generate report — optional body picking the month to refresh
// ---------------------------------------------------------------------------
export const generateReportSchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, "Expected YYYY-MM-01")
      .optional(),
  })
  .optional();

export type GenerateReportInput = z.infer<typeof generateReportSchema>;
