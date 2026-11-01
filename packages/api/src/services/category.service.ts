import type { CreateCategoryInput, UpdateCategoryInput } from "@spendoza/shared";
import type { ServiceContext } from "./context";

// ---------------------------------------------------------------------------
// listCategories — returns system defaults + custom categories for user
// ---------------------------------------------------------------------------
export async function listCategories(ctx: ServiceContext) {
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId)
    .order("name");

  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// createCategory — inserts a new custom category for the user
// ---------------------------------------------------------------------------
export async function createCategory(ctx: ServiceContext, input: CreateCategoryInput) {
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("categories")
    .insert({ ...input, user_id: userId })
    .select()
    .single();

  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// updateCategory — updates by id + user_id
// ---------------------------------------------------------------------------
export async function updateCategory(
  ctx: ServiceContext,
  id: string,
  input: UpdateCategoryInput
) {
  const { supabase, userId } = ctx;

  let oldName: string | null = null;
  if (input.name !== undefined) {
    const { data: current } = await supabase
      .from("categories")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    oldName = current?.name ?? null;
  }

  const { data, error } = await supabase
    .from("categories")
    .update(input)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  // Transactions match categories by name (free text), so a rename carries them along
  if (data && oldName !== null && input.name !== undefined && input.name !== oldName) {
    const { error: renameError } = await supabase
      .from("transactions")
      .update({ ai_category: input.name })
      .eq("user_id", userId)
      .eq("ai_category", oldName);
    if (renameError) return { data: null, error: renameError };
  }

  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// deleteCategory — checks is_system_default first; rejects system defaults
// ---------------------------------------------------------------------------
export async function deleteCategory(ctx: ServiceContext, id: string) {
  const { supabase, userId } = ctx;

  // Look up the category to check ownership and system default flag
  const { data: category, error: lookupError } = await supabase
    .from("categories")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (lookupError || !category) {
    return {
      data: null,
      error: lookupError ?? { message: "Category not found" },
    };
  }

  if (category.is_system_default) {
    return {
      data: null,
      error: { message: "Cannot delete system default categories", status: 403 },
    };
  }

  // expenses.category_id is NOT NULL, so this user's bills move to their "Other" category
  const { data: other } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("name", "Other")
    .eq("is_system_default", true)
    .maybeSingle();

  if (!other) {
    return {
      data: null,
      error: { message: 'Cannot delete this category: your "Other" category is missing' },
    };
  }

  const { error: txnError } = await supabase
    .from("transactions")
    .update({ ai_category: null })
    .eq("user_id", userId)
    .eq("ai_category", category.name);
  if (txnError) return { data: null, error: txnError };

  const { error: expenseError } = await supabase
    .from("expenses")
    .update({ category_id: other.id })
    .eq("user_id", userId)
    .eq("category_id", id);
  if (expenseError) return { data: null, error: expenseError };

  const { error: deleteError } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  return { data: null, error: deleteError ?? null };
}
