import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const statementStatusSchema = z.enum([
  "uploaded",
  "processing",
  "parsed",
  "failed",
]);

export type StatementStatus = z.infer<typeof statementStatusSchema>;

// ---------------------------------------------------------------------------
// Upload bank statement (API input)
// ---------------------------------------------------------------------------
export const uploadBankStatementSchema = z.object({
  bank_name: z.string().nullable().optional(),
  is_shared_account: z.preprocess(
    (v) => (typeof v === "string" ? v === "true" : v),
    z.boolean().default(false)
  ),
  account_label: z.string().nullable().optional(),
});

export type UploadBankStatementInput = z.infer<
  typeof uploadBankStatementSchema
>;

// ---------------------------------------------------------------------------
// Full bank statement row
// ---------------------------------------------------------------------------
export interface BankStatement {
  id: string;
  user_id: string;
  file_path: string;
  file_hash: string;
  file_type: string;
  bank_name: string | null;
  statement_month: string | null;
  is_shared_account: boolean;
  account_label: string | null;
  status: StatementStatus;
  parsed_data: unknown;
  created_at: string;
}
