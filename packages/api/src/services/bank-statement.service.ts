import crypto from "crypto";
import type { ServiceContext } from "./context";

/**
 * Computes a SHA-256 hash of the given file buffer.
 * Used to detect duplicate bank statement uploads.
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function listBankStatements(ctx: ServiceContext) {
  return ctx.supabase
    .from("bank_statements")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false });
}

export async function getBankStatement(ctx: ServiceContext, id: string) {
  const { data: statement, error } = await ctx.supabase
    .from("bank_statements")
    .select("*")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .single();

  if (error || !statement) {
    return { statement: null, transactions: null, error };
  }

  const { data: transactions } = await ctx.supabase
    .from("transactions")
    .select("*")
    .eq("bank_statement_id", statement.id);

  return { statement, transactions: transactions ?? [], error: null };
}
