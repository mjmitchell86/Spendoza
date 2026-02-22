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
