import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ServiceContext } from "../context";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_EMAIL = "test@example.com";

const profileData = {
  id: TEST_USER_ID,
  display_name: "Test User",
  onboarding_completed: false,
  household_id: null,
  income_sharing_mode: "all",
  shared_income_amount: null,
  expense_sharing_mode: "all",
  avatar_url: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------

// getProfile: .from("profiles").select("*").eq("id", userId).single()
const mockSingle = mock(() => Promise.resolve({ data: profileData, error: null }));

const mockEqChain: Record<string, any> = {};
mockEqChain.eq = mock(() => mockEqChain);
mockEqChain.single = mockSingle;
mockEqChain.select = mock(() => mockEqChain);

// updateProfile: .from("profiles").update(input).eq("id", userId).select().single()
const mockUpdateSingle = mock(() => Promise.resolve({ data: profileData, error: null }));
const mockUpdate = mock(() => ({
  eq: () => ({ select: () => ({ single: mockUpdateSingle }) }),
}));

const mockSelect = mock((_cols?: string) => ({
  eq: () => mockEqChain,
}));

const mockFrom = mock((_table: string) => ({
  select: mockSelect,
  update: mockUpdate,
}));

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
  mockSingle.mockClear();
  mockEqChain.eq.mockClear();
  mockEqChain.select.mockClear();
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
  mockSelect.mockClear();
  mockFrom.mockClear();

  mockSingle.mockImplementation(() => Promise.resolve({ data: profileData, error: null }));
  mockUpdateSingle.mockImplementation(() => Promise.resolve({ data: profileData, error: null }));
  mockEqChain.eq.mockImplementation(() => mockEqChain);
});

// ---------------------------------------------------------------------------
// Import service
// ---------------------------------------------------------------------------
const { getProfile, updateProfile } = await import("../profile.service");

// ===========================================================================
// getProfile
// ===========================================================================
describe("getProfile", () => {
  it("returns the user profile", async () => {
    const { data, error } = await getProfile(ctx);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBe(TEST_USER_ID);
    expect(data!.display_name).toBe("Test User");
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockSingle).toHaveBeenCalledTimes(1);
  });

  it("returns error when profile not found", async () => {
    mockSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const { data, error } = await getProfile(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });

  it("returns error on database failure", async () => {
    mockSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await getProfile(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// updateProfile
// ===========================================================================
describe("updateProfile", () => {
  it("updates and returns the profile", async () => {
    const updatedProfile = { ...profileData, display_name: "New Name" };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedProfile, error: null })
    );

    const { data, error } = await updateProfile(ctx, { display_name: "New Name" });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.display_name).toBe("New Name");
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns error on database failure", async () => {
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await updateProfile(ctx, { display_name: "New Name" });

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});
