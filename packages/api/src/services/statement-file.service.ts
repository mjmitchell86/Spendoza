import { supabaseAdmin } from "../lib/supabase";

const BUCKET = "bank-statements";

/**
 * Whether `filePath` is a file directly inside the user's statements folder
 * (`<userId>/statements/<name>`). Statement files are read and deleted with the
 * service role, so a path from the database must never reach another user's
 * files: no nested or traversal segments, backslashes, `%` escapes or control
 * characters in the file name.
 */
export function isOwnedStatementPath(userId: string, filePath: string): boolean {
  if (!userId || userId.includes("/") || typeof filePath !== "string") return false;

  const prefix = `${userId}/statements/`;
  if (!filePath.startsWith(prefix)) return false;

  const name = filePath.slice(prefix.length);
  return name !== "" && name !== "." && name !== ".." && !/[/\\%\x00-\x1f\x7f]/.test(name);
}

function refuse(action: string, userId: string, filePath: string): { error: string } {
  console.error(`[statement-file] refusing to ${action} "${filePath}": not in statements folder of user ${userId}`);
  return { error: "Statement file path is outside the owner's folder" };
}

/** Delete a user's uploaded statement file from Supabase Storage. */
export async function removeStatementFile(
  userId: string,
  filePath: string
): Promise<{ error: string | null }> {
  if (!isOwnedStatementPath(userId, filePath)) return refuse("delete", userId, filePath);

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([filePath]);
  return { error: error ? error.message : null };
}

/** Download a user's uploaded statement file from Supabase Storage. */
export async function downloadStatementFile(
  userId: string,
  filePath: string
): Promise<{ data: Blob | null; error: string | null }> {
  if (!isOwnedStatementPath(userId, filePath)) {
    return { data: null, ...refuse("download", userId, filePath) };
  }

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(filePath);
  if (error || !data) {
    return { data: null, error: error ? error.message : "No file data returned" };
  }
  return { data, error: null };
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
