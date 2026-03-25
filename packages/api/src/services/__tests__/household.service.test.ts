import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ServiceContext } from "../context";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_TARGET_USER_ID = "user-456";
const TEST_HOUSEHOLD_ID = "household-789";
const TEST_EMAIL = "test@example.com";

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------

// We need a flexible single mock that can be configured per test
let mockSingleResult: { data: any; error: any } = { data: null, error: null };
const mockSingle = mock(() => Promise.resolve(mockSingleResult));

const mockEqChain: Record<string, any> = {};
mockEqChain.eq = mock(() => mockEqChain);
mockEqChain.single = mockSingle;
mockEqChain.select = mock(() => mockEqChain);

const mockFrom = mock((_table: string) => mockEqChain);

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
  mockFrom.mockClear();

  mockSingleResult = { data: null, error: null };
  mockSingle.mockImplementation(() => Promise.resolve(mockSingleResult));
  mockEqChain.eq.mockImplementation(() => mockEqChain);
  mockEqChain.select.mockImplementation(() => mockEqChain);
});

// ---------------------------------------------------------------------------
// Import service
// ---------------------------------------------------------------------------
const { resolveEntity, validateHouseholdMembership } = await import(
  "../household.service"
);

// ===========================================================================
// resolveEntity
// ===========================================================================
describe("resolveEntity", () => {
  it("returns user entity when no entityTypeParam is provided", async () => {
    const result = await resolveEntity(ctx, undefined);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      entityType: "user",
      entityId: TEST_USER_ID,
    });
  });

  it("returns user entity when entityTypeParam is 'user'", async () => {
    const result = await resolveEntity(ctx, "user");

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      entityType: "user",
      entityId: TEST_USER_ID,
    });
  });

  it("returns household entity when entityTypeParam is 'household' and user has one", async () => {
    mockSingleResult = {
      data: { household_id: TEST_HOUSEHOLD_ID },
      error: null,
    };

    const result = await resolveEntity(ctx, "household");

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      entityType: "household",
      entityId: TEST_HOUSEHOLD_ID,
    });
    expect(mockFrom).toHaveBeenCalledWith("profiles");
  });

  it("returns error when entityTypeParam is 'household' and user has no household", async () => {
    mockSingleResult = { data: { household_id: null }, error: null };

    const result = await resolveEntity(ctx, "household");

    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      message: "You are not a member of any household",
    });
  });

  it("returns error when entityTypeParam is 'household' and profile query returns no data", async () => {
    mockSingleResult = { data: null, error: { message: "Not found" } };

    const result = await resolveEntity(ctx, "household");

    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      message: "You are not a member of any household",
    });
  });

  it("returns error for invalid entity type", async () => {
    const result = await resolveEntity(ctx, "organization");

    expect(result.data).toBeNull();
    expect(result.error).toEqual({ message: "Invalid entity_type" });
  });
});

// ===========================================================================
// validateHouseholdMembership
// ===========================================================================
describe("validateHouseholdMembership", () => {
  it("returns true when both users belong to the same household", async () => {
    // First call: current user's profile; second call: target user's profile
    let callCount = 0;
    mockSingle.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        data: { household_id: TEST_HOUSEHOLD_ID },
        error: null,
      });
    });

    const result = await validateHouseholdMembership(ctx, TEST_TARGET_USER_ID);

    expect(result).toBe(true);
    expect(callCount).toBe(2);
  });

  it("returns false when users belong to different households", async () => {
    let callCount = 0;
    mockSingle.mockImplementation(() => {
      callCount++;
      const householdId =
        callCount === 1 ? TEST_HOUSEHOLD_ID : "household-other";
      return Promise.resolve({
        data: { household_id: householdId },
        error: null,
      });
    });

    const result = await validateHouseholdMembership(ctx, TEST_TARGET_USER_ID);

    expect(result).toBe(false);
  });

  it("returns false when current user has no household", async () => {
    let callCount = 0;
    mockSingle.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        data: { household_id: callCount === 1 ? null : TEST_HOUSEHOLD_ID },
        error: null,
      });
    });

    const result = await validateHouseholdMembership(ctx, TEST_TARGET_USER_ID);

    expect(result).toBe(false);
  });

  it("returns false when target user has no household", async () => {
    let callCount = 0;
    mockSingle.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        data: { household_id: callCount === 1 ? TEST_HOUSEHOLD_ID : null },
        error: null,
      });
    });

    const result = await validateHouseholdMembership(ctx, TEST_TARGET_USER_ID);

    expect(result).toBe(false);
  });
});
