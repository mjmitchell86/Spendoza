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

  const { data, error } = await supabase
    .from("categories")
    .update(input)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

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

  const { error: deleteError } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  return { data: null, error: deleteError ?? null };
}
