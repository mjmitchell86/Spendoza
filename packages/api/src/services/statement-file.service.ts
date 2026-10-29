import { supabaseAdmin } from "../lib/supabase";

const BUCKET = "bank-statements";

/** Delete an uploaded statement file from Supabase Storage. */
export async function removeStatementFile(filePath: string): Promise<{ error: string | null }> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([filePath]);
  return { error: error ? error.message : null };
}

/**
 * Whether a statement other than `ignoreIds` still needs the file at `filePath`.
 * Multi-month CSV splits share one file between the parent and its children.
 * A statement that is still processing may need it, and a failed one keeps it
 * so Retry can re-download it; only parsed statements are done with it.
 */
export async function isStatementFileNeeded(
  userId: string,
  filePath: string,
  ignoreIds: string[]
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("bank_statements")
    .select("id")
    .eq("user_id", userId)
    .eq("file_path", filePath)
    .neq("status", "parsed");

  if (error) {
    throw new Error(`Failed to check statement file references: ${error.message}`);
  }

  return (data ?? []).some((row: { id: string }) => !ignoreIds.includes(row.id));
}
