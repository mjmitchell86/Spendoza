import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Mock supabase module before importing the module under test.
// Chain: from("profiles").select("subscription_tier").eq("id", userId).single()
// ---------------------------------------------------------------------------
const mockGetUser = mock();
const mockSingle = mock();
const mockEq = mock(() => ({ single: mockSingle }));
const mockSelect = mock(() => ({ eq: mockEq }));
const mockFrom = mock(() => ({ select: mockSelect }));

mock.module("../lib/supabase", () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
  createSupabaseClient: mock(() => ({ _type: "user-client" })),
}));

const { createSessionFromToken, getUserTier } = await import("../auth/session");

describe("createSessionFromToken", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it("returns a ServiceContext for a valid token", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: { id: "user-123", email: "test@example.com" },
      },
      error: null,
    });

    const ctx = await createSessionFromToken("valid-token");
    expect(ctx).not.toBeNull();
    expect(ctx!.userId).toBe("user-123");
    expect(ctx!.email).toBe("test@example.com");
    expect(ctx!.supabase).toBeDefined();
    expect(ctx!.supabaseAdmin).toBeDefined();
  });

  it("returns null for an invalid token", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid JWT" },
    });

    const ctx = await createSessionFromToken("bad-token");
    expect(ctx).toBeNull();
  });

  it("returns null when Supabase returns an error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Token expired" },
    });

    const ctx = await createSessionFromToken("expired-token");
    expect(ctx).toBeNull();
  });
});

describe("getUserTier", () => {
  beforeEach(() => {
    mockSingle.mockReset();
    mockEq.mockReset();
    mockEq.mockReturnValue({ single: mockSingle });
  });

  it("returns the subscription tier from the profile", async () => {
    mockSingle.mockResolvedValue({
      data: { subscription_tier: "pro" },
      error: null,
    });

    const tier = await getUserTier("user-123");
    expect(tier).toBe("pro");
  });

  it("returns 'free' when no profile is found", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const tier = await getUserTier("unknown-user");
    expect(tier).toBe("free");
  });

  it("returns 'free' when subscription_tier is null", async () => {
    mockSingle.mockResolvedValue({
      data: { subscription_tier: null },
      error: null,
    });

    const tier = await getUserTier("user-456");
    expect(tier).toBe("free");
  });

  it("returns 'starter' for starter tier profiles", async () => {
    mockSingle.mockResolvedValue({
      data: { subscription_tier: "starter" },
      error: null,
    });

    const tier = await getUserTier("user-789");
    expect(tier).toBe("starter");
  });
});
