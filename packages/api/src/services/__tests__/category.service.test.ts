import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ServiceContext } from "../context";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_EMAIL = "test@example.com";

const categoryData = {
  id: "cat-1",
  user_id: TEST_USER_ID,
  name: "Groceries",
  is_shared_with_household: false,
  is_system_default: false,
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
};

const systemCategory = {
  id: "cat-system-1",
  user_id: TEST_USER_ID,
  name: "Uncategorized",
  is_shared_with_household: false,
  is_system_default: true,
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
};

const categoriesList = [categoryData, systemCategory];

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------

// listCategories: .from("categories").select("*").eq("user_id",...).order("name")
const mockOrder = mock(() => Promise.resolve({ data: categoriesList, error: null }));

// createCategory: .from("categories").insert({...}).select().single()
const mockInsertSingle = mock(() => Promise.resolve({ data: categoryData, error: null }));
const mockInsert = mock(() => ({ select: () => ({ single: mockInsertSingle }) }));

// updateCategory: .from("categories").update({...}).eq("id",...).eq("user_id",...).select().single()
const mockUpdateSingle = mock(() => Promise.resolve({ data: categoryData, error: null }));
const mockUpdate = mock(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
}));

// deleteCategory lookup + delete
// DELETE lookup: .select("*").eq("id",...).eq("user_id",...).single()
// DELETE execute: .delete().eq("id",...).eq("user_id",...)
const mockDeleteResult = mock(() => Promise.resolve({ data: null, error: null }));
const mockDelete = mock(() => ({ eq: () => ({ eq: mockDeleteResult }) }));

const mockSelectSingle = mock(() => Promise.resolve({ data: categoryData, error: null }));

// SELECT supports both GET list (.select("*").eq("user_id",...).order()) and
// DELETE lookup (.select("*").eq("id",...).eq("user_id",...).single())
const mockSelect = mock(() => ({
  eq: () => ({
    order: mockOrder,
    eq: () => ({ single: mockSelectSingle }),
    single: mockSelectSingle,
  }),
}));

// "Other" lookup: .select("id").eq(user_id).eq(name).eq(is_system_default).maybeSingle()
const otherCategory = { id: "cat-other" };
const mockOtherMaybeSingle = mock(() => Promise.resolve({ data: otherCategory, error: null }));

// transactions / expenses updates: .update({...}).eq(...).eq(...) (awaited)
const mockTxnUpdateEq2 = mock((..._a: any[]) => Promise.resolve({ error: null }));
const mockTxnUpdate = mock((_v: any) => ({
  eq: (..._a: any[]) => ({ eq: mockTxnUpdateEq2 }),
}));
const mockExpUpdateEq2 = mock((..._a: any[]) => Promise.resolve({ error: null }));
const mockExpUpdate = mock((_v: any) => ({
  eq: (..._a: any[]) => ({ eq: mockExpUpdateEq2 }),
}));

const mockFrom = mock((table: string) => {
  if (table === "transactions") return { update: mockTxnUpdate };
  if (table === "expenses") return { update: mockExpUpdate };
  return {
    select: (cols: string) =>
      cols === "id"
        ? { eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockOtherMaybeSingle }) }) }) }
        : mockSelect(),
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  };
});

const mockSupabase = { from: mockFrom } as any;
const mockSupabaseAdmin = { from: mock() } as any;

const ctx: ServiceContext = {
  supabase: mockSupabase,
  supabaseAdmin: mockSupabaseAdmin,
  userId: TEST_USER_ID,
  email: TEST_EMAIL,
};

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockOrder.mockClear();
  mockInsertSingle.mockClear();
  mockInsert.mockClear();
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
  mockDeleteResult.mockClear();
  mockDelete.mockClear();
  mockSelectSingle.mockClear();
  mockSelect.mockClear();
  mockFrom.mockClear();
  mockOtherMaybeSingle.mockClear();
  mockTxnUpdate.mockClear();
  mockTxnUpdateEq2.mockClear();
  mockExpUpdate.mockClear();
  mockExpUpdateEq2.mockClear();

  mockOtherMaybeSingle.mockImplementation(() => Promise.resolve({ data: otherCategory, error: null }));
  mockTxnUpdateEq2.mockImplementation(() => Promise.resolve({ error: null }));
  mockExpUpdateEq2.mockImplementation(() => Promise.resolve({ error: null }));
  mockOrder.mockImplementation(() => Promise.resolve({ data: categoriesList, error: null }));
  mockInsertSingle.mockImplementation(() => Promise.resolve({ data: categoryData, error: null }));
  mockUpdateSingle.mockImplementation(() => Promise.resolve({ data: categoryData, error: null }));
  mockSelectSingle.mockImplementation(() => Promise.resolve({ data: categoryData, error: null }));
  mockDeleteResult.mockImplementation(() => Promise.resolve({ data: null, error: null }));
});

// ---------------------------------------------------------------------------
// Import service
// ---------------------------------------------------------------------------
const { listCategories, createCategory, updateCategory, deleteCategory } = await import(
  "../category.service"
);

// ===========================================================================
// listCategories
// ===========================================================================
describe("listCategories", () => {
  it("returns all categories for the user", async () => {
    const { data, error } = await listCategories(ctx);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0].name).toBe("Groceries");
    expect(mockFrom).toHaveBeenCalledWith("categories");
    expect(mockOrder).toHaveBeenCalled();
  });

  it("returns error on database failure", async () => {
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await listCategories(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// createCategory
// ===========================================================================
describe("createCategory", () => {
  const validInput = {
    name: "Groceries",
    icon: null,
    is_shared_with_household: false,
  };

  it("creates and returns a category", async () => {
    const { data, error } = await createCategory(ctx, validInput);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBe("cat-1");
    expect(data!.name).toBe("Groceries");
    expect(mockFrom).toHaveBeenCalledWith("categories");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("returns error on database failure", async () => {
    mockInsertSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await createCategory(ctx, validInput);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// updateCategory
// ===========================================================================
describe("updateCategory", () => {
  it("updates and returns the category", async () => {
    const updatedCategory = { ...categoryData, name: "Food & Drinks" };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedCategory, error: null })
    );

    const { data, error } = await updateCategory(ctx, "cat-1", { name: "Food & Drinks" });

    expect(error).toBeNull();
    expect(data!.name).toBe("Food & Drinks");
    expect(mockFrom).toHaveBeenCalledWith("categories");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("moves this user's transactions from the old name to the new name", async () => {
    mockSelectSingle.mockImplementation(() =>
      Promise.resolve({ data: categoryData, error: null })
    );
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: { ...categoryData, name: "Food" }, error: null })
    );

    const { error } = await updateCategory(ctx, "cat-1", { name: "Food" });

    expect(error).toBeNull();
    expect(mockTxnUpdate).toHaveBeenCalledWith({ ai_category: "Food" });
    expect(mockTxnUpdateEq2).toHaveBeenCalledWith("ai_category", "Groceries");
  });

  it("leaves transactions alone when the name is unchanged or not sent", async () => {
    await updateCategory(ctx, "cat-1", { icon: "x" });
    mockSelectSingle.mockImplementation(() =>
      Promise.resolve({ data: categoryData, error: null })
    );
    await updateCategory(ctx, "cat-1", { name: "Groceries" });

    expect(mockTxnUpdate).not.toHaveBeenCalled();
  });

  it("returns error when category not found", async () => {
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const { data, error } = await updateCategory(ctx, "cat-nonexistent", { name: "X" });

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// deleteCategory
// ===========================================================================
describe("deleteCategory", () => {
  it("deletes a custom category successfully", async () => {
    mockSelectSingle.mockImplementation(() =>
      Promise.resolve({ data: categoryData, error: null })
    );

    const { error } = await deleteCategory(ctx, "cat-1");

    expect(error).toBeNull();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("uncategorizes transactions and moves expenses to Other before deleting", async () => {
    const { error } = await deleteCategory(ctx, "cat-1");

    expect(error).toBeNull();
    expect(mockTxnUpdate).toHaveBeenCalledWith({ ai_category: null });
    expect(mockTxnUpdateEq2).toHaveBeenCalledWith("ai_category", "Groceries");
    expect(mockExpUpdate).toHaveBeenCalledWith({ category_id: "cat-other" });
    expect(mockExpUpdateEq2).toHaveBeenCalledWith("category_id", "cat-1");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("refuses with a clear message and deletes nothing when Other is missing", async () => {
    mockOtherMaybeSingle.mockImplementation(() => Promise.resolve({ data: null, error: null }));

    const { error } = await deleteCategory(ctx, "cat-1");

    expect((error as any).message).toContain('"Other" category');
    expect(mockExpUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("does not delete when moving expenses fails", async () => {
    mockExpUpdateEq2.mockImplementation(() => Promise.resolve({ error: { message: "boom" } }));

    const { error } = await deleteCategory(ctx, "cat-1");

    expect(error).toBeDefined();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 403 error for system default category", async () => {
    mockSelectSingle.mockImplementation(() =>
      Promise.resolve({ data: systemCategory, error: null })
    );

    const { data, error } = await deleteCategory(ctx, "cat-system-1");

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect((error as any).message).toBe("Cannot delete system default categories");
    expect((error as any).status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns error when category not found", async () => {
    mockSelectSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found" } })
    );

    const { data, error } = await deleteCategory(ctx, "cat-nonexistent");

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });

  it("returns error on delete database failure", async () => {
    mockSelectSingle.mockImplementation(() =>
      Promise.resolve({ data: categoryData, error: null })
    );
    mockDeleteResult.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { error } = await deleteCategory(ctx, "cat-1");

    expect(error).toBeDefined();
  });
});
