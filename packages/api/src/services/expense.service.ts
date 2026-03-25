import type { CreateExpenseInput, UpdateExpenseInput } from "@spendoza/shared";
import type { ServiceContext } from "./context";

// ---------------------------------------------------------------------------
// Filters accepted by listExpenses
// ---------------------------------------------------------------------------
export interface ExpenseFilters {
  category_id?: string;
  frequency?: string;
  from_date?: string;
  to_date?: string;
}

// ---------------------------------------------------------------------------
// listExpenses — filterable by category, frequency, date range; excludes expired bills
// ---------------------------------------------------------------------------
export async function listExpenses(ctx: ServiceContext, filters?: ExpenseFilters) {
  const { supabase, userId } = ctx;

  let query = supabase.from("expenses").select("*").eq("user_id", userId);

  if (filters?.category_id) {
    query = query.eq("category_id", filters.category_id);
  }

  if (filters?.frequency) {
    query = query.eq("frequency", filters.frequency);
  }

  if (filters?.from_date) {
    query = query.gte("next_due_date", filters.from_date);
  }

  if (filters?.to_date) {
    query = query.lte("next_due_date", filters.to_date);
  }

  // Exclude expired bills (end_date in the past)
  query = query.or("end_date.is.null,end_date.gte." + new Date().toISOString().slice(0, 10));

  const { data, error } = await query.order("next_due_date", { ascending: true });

  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// createExpense — inserts a new expense for the user
// ---------------------------------------------------------------------------
export async function createExpense(ctx: ServiceContext, input: CreateExpenseInput) {
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("expenses")
    .insert({ ...input, user_id: userId })
    .select()
    .single();

  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// updateExpense — updates by id + user_id
// ---------------------------------------------------------------------------
export async function updateExpense(
  ctx: ServiceContext,
  id: string,
  input: UpdateExpenseInput
) {
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("expenses")
    .update(input)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// deleteExpense — deletes by id + user_id
// ---------------------------------------------------------------------------
export async function deleteExpense(ctx: ServiceContext, id: string) {
  const { supabase, userId } = ctx;

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  return { error: error ?? null };
}
