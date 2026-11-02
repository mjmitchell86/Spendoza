import { MAX_BANK_STATEMENT_BYTES, MAX_BANK_STATEMENT_SIZE_MB } from "@spendoza/shared";

type TransactionUpdate = { ai_category?: string | null; attributed_to_user_id?: string };

// Assigning goes through /attribute (the plain update strips attributed_to_user_id); category edits use the plain update.
export function transactionUpdateRequest(
  transactionId: string,
  data: TransactionUpdate
): { path: string; init: RequestInit } {
  const path =
    data.attributed_to_user_id !== undefined
      ? `/transactions/${transactionId}/attribute`
      : `/transactions/${transactionId}`;
  return { path, init: { method: "PUT", body: JSON.stringify(data) } };
}

// Error for a statement over the upload limit, or null when it fits.
export function oversizeFileError(file: { name: string; size: number }): string | null {
  return file.size > MAX_BANK_STATEMENT_BYTES
    ? `${file.name}: exceeds ${MAX_BANK_STATEMENT_SIZE_MB}MB`
    : null;
}
