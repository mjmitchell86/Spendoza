import type { ServiceContext } from "./context";

export interface TransactionFilters {
  bank_statement_id?: string;
  from_date?: string;
  to_date?: string;
  type?: string;
}

export async function listTransactions(ctx: ServiceContext, filters?: TransactionFilters) {
  let query = ctx.supabase
    .from("transactions")
    .select("*")
    .eq("user_id", ctx.userId);

  if (filters?.bank_statement_id) {
    query = query.eq("bank_statement_id", filters.bank_statement_id);
  }
  if (filters?.from_date) {
    query = query.gte("date", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("date", filters.to_date);
  }
  if (filters?.type) {
    query = query.eq("type", filters.type);
  }

  return query.order("date", { ascending: false });
}

export async function updateTransaction(
  ctx: ServiceContext,
  id: string,
  input: Record<string, any>
) {
  return ctx.supabase
    .from("transactions")
    .update(input)
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select()
    .single();
}
