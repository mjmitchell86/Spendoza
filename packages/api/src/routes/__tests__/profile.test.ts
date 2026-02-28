import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_TOKEN = "valid-access-token";

const profileData = {
  id: TEST_USER_ID,
  display_name: "Test User",
  onboarding_completed: false,
  household_id: null,
  income_sharing_mode: "all" as const,
  shared_income_amount: null,
  expense_sharing_mode: "all" as const,
  avatar_url: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Mock functions for the RLS client (chainable query builder)
// ---------------------------------------------------------------------------
const mockSingle = mock(() =>
  Promise.resolve({ data: profileData, error: null })
);

// Recursive chain that supports arbitrary depth of .eq(), .gte(), .lt(), etc.
const makeQueryChain = (): any => ({
  eq: () => makeQueryChain(),
  gte: () => makeQueryChain(),
  lt: () => makeQueryChain(),
  is: () => makeQueryChain(),
  ilike: () => makeQueryChain(),
  order: () => makeQueryChain(),
  single: mockSingle,
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
  then: (resolve: any, reject?: any) =>
    Promise.resolve({ data: [], error: null }).then(resolve, reject),
});

const mockEq = mock(() => makeQueryChain());
const mockSelect = mock((..._args: any[]) => makeQueryChain());

// For update chains: .update(data).eq("id", id).select().single()
const mockUpdateSingle = mock(() =>
  Promise.resolve({ data: profileData, error: null })
);
const mockUpdateSelect = mock(() => ({ single: mockUpdateSingle }));
const mockUpdateEq = mock(() => ({ select: mockUpdateSelect }));
const mockUpdate = mock(() => ({ eq: mockUpdateEq }));

const mockFrom = mock(() => ({
  select: mockSelect,
  update: mockUpdate,
  upsert: (_data: any, _opts?: any) => ({
    select: () => ({
      single: () => Promise.resolve({ data: null, error: null }),
    }),
    then: (resolve: any) => resolve({ data: null, error: null }),
  }),
}));

// Storage mocks for avatar upload
const mockStorageUpload = mock(() =>
  Promise.resolve({ data: { path: `${TEST_USER_ID}/avatar.jpg` }, error: null })
);
const mockGetPublicUrl = mock(() => ({
  data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/avatars/${TEST_USER_ID}/avatar.jpg` },
}));
const mockStorageFrom = mock(() => ({
  upload: mockStorageUpload,
  getPublicUrl: mockGetPublicUrl,
}));

// ---------------------------------------------------------------------------
// Mock for supabaseAdmin (auth middleware uses getUser)
// ---------------------------------------------------------------------------
const mockGetUser = mock(() =>
  Promise.resolve({
    data: {
      user: {
        id: TEST_USER_ID,
        email: "test@example.com",
      },
    },
    error: null,
  })
);

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js BEFORE any import that depends on it.
// createClient is called twice:
//   1. At module level in supabase.ts for supabaseAdmin (service role)
//   2. At request time via createSupabaseClient (RLS client with access token)
//
// We use the URL argument to distinguish them:
//   - First two calls are module-level (supabaseAdmin + anon fallback)
//   - createSupabaseClient passes options with Authorization header
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    if (options?.global?.headers?.Authorization) {
      return { from: mockFrom, storage: { from: mockStorageFrom } };
    }
    // Admin client — used by routes (supabaseAdmin) and auth middleware (getUser)
    return {
      auth: {
        admin: { createUser: mock() },
        signInWithPassword: mock(),
        getUser: mockGetUser,
      },
      from: mockFrom,
      storage: { from: mockStorageFrom },
    };
  },
}));

// ---------------------------------------------------------------------------
// Mock multer for avatar upload testing
// ---------------------------------------------------------------------------
const fakeImageBuffer = Buffer.from("fake-image-data");

mock.module("multer", () => {
  const multerInstance = () => ({
    single: (_fieldName: string) => {
      return (req: any, _res: any, next: any) => {
        req.file = {
          fieldname: "file",
          originalname: "avatar.jpg",
          mimetype: "image/jpeg",
          buffer: fakeImageBuffer,
          size: fakeImageBuffer.length,
        };
        next();
      };
    },
  });
  multerInstance.memoryStorage = () => ({});
  return { default: multerInstance };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: profileRouter } = (await import("../profile")) as { default: Router };
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/profile", requireAuth, profileRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  // Clear all mocks
  mockSingle.mockClear();
  mockEq.mockClear();
  mockSelect.mockClear();
  mockUpdate.mockClear();
  mockUpdateEq.mockClear();
  mockUpdateSelect.mockClear();
  mockUpdateSingle.mockClear();
  mockFrom.mockClear();
  mockGetUser.mockClear();
  mockStorageUpload.mockClear();
  mockGetPublicUrl.mockClear();
  mockStorageFrom.mockClear();

  // Reset to successful defaults
  mockGetUser.mockImplementation(() =>
    Promise.resolve({
      data: {
        user: {
          id: TEST_USER_ID,
          email: "test@example.com",
        },
      },
      error: null,
    })
  );

  mockSingle.mockImplementation(() =>
    Promise.resolve({ data: profileData, error: null })
  );

  mockUpdateSingle.mockImplementation(() =>
    Promise.resolve({ data: profileData, error: null })
  );

  mockStorageUpload.mockImplementation(() =>
    Promise.resolve({ data: { path: `${TEST_USER_ID}/avatar.jpg` }, error: null })
  );

  mockGetPublicUrl.mockImplementation(() => ({
    data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/avatars/${TEST_USER_ID}/avatar.jpg` },
  }));
});

// ===========================================================================
// GET /api/profile
// ===========================================================================
describe("GET /api/profile", () => {
  const url = () => `${baseUrl}/api/profile`;

  it("returns 200 with profile data when authenticated", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(TEST_USER_ID);
    expect(body.display_name).toBe("Test User");
    expect(body.onboarding_completed).toBe(false);
    expect(body.income_sharing_mode).toBe("all");
    expect(body.expense_sharing_mode).toBe("all");

    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("profiles");
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization header");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 404 when profile not found", async () => {
    mockSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Profile not found");
  });
});

// ===========================================================================
// PUT /api/profile
// ===========================================================================
describe("PUT /api/profile", () => {
  const url = () => `${baseUrl}/api/profile`;

  it("returns 200 with updated profile", async () => {
    const updatedProfile = {
      ...profileData,
      display_name: "Updated Name",
      income_sharing_mode: "partial" as const,
    };

    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedProfile, error: null })
    );

    const res = await fetch(url(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        display_name: "Updated Name",
        income_sharing_mode: "partial",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.display_name).toBe("Updated Name");
    expect(body.income_sharing_mode).toBe("partial");

    expect(mockFrom).toHaveBeenCalledWith("profiles");
  });

  it("returns 400 with invalid data", async () => {
    const res = await fetch(url(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        income_sharing_mode: "invalid_mode",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 with empty display_name", async () => {
    const res = await fetch(url(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        display_name: "",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });
});

// ===========================================================================
// PUT /api/profile/onboarding
// ===========================================================================
describe("PUT /api/profile/onboarding", () => {
  const url = () => `${baseUrl}/api/profile/onboarding`;

  it("returns 200 with onboarding_completed set to true", async () => {
    const onboardedProfile = {
      ...profileData,
      onboarding_completed: true,
    };

    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: onboardedProfile, error: null })
    );

    const res = await fetch(url(), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.onboarding_completed).toBe(true);

    expect(mockFrom).toHaveBeenCalledWith("profiles");
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url(), {
      method: "PUT",
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization header");
  });
});

// ===========================================================================
// POST /api/profile/avatar
// ===========================================================================
describe("POST /api/profile/avatar", () => {
  const url = () => `${baseUrl}/api/profile/avatar`;

  it("returns 200 with updated profile including avatar_url", async () => {
    const avatarProfile = {
      ...profileData,
      avatar_url: "https://example.supabase.co/storage/v1/object/public/avatars/user-123/avatar.jpg?t=123",
    };

    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: avatarProfile, error: null })
    );

    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avatar_url).toContain("avatar");
    expect(mockStorageFrom).toHaveBeenCalledWith("avatars");
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url(), {
      method: "POST",
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization header");
  });
});
