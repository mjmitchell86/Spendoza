import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  mock,
} from "bun:test";
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
  gt: () => makeQueryChain(),
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

// Per-client wrappers so tests can tell the RLS (user JWT) client from the
// service-role client; both share the same query-builder mocks.
const mockRlsFrom = mock((...args: any[]) => (mockFrom as any)(...args));
const mockAdminFrom = mock((...args: any[]) => (mockFrom as any)(...args));

// Storage mocks for avatar upload
const mockStorageUpload = mock(() =>
  Promise.resolve({ data: { path: `${TEST_USER_ID}/avatar.jpg` }, error: null })
);
const mockGetPublicUrl = mock(() => ({
  data: {
    publicUrl: `https://example.supabase.co/storage/v1/object/public/avatars/${TEST_USER_ID}/avatar.jpg`,
  },
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

const mockAdminSignOut = mock((_jwt: string, _scope?: string) =>
  Promise.resolve({ data: null, error: null as { message: string; status?: number } | null })
);

// ---------------------------------------------------------------------------
// Mock heavy transitive deps so module loading doesn't time out in CI
// profile.ts -> report.service -> report-insights -> @langchain/*
// ---------------------------------------------------------------------------
mock.module("@langchain/openai", () => ({
  ChatOpenAI: class {
    invoke = mock(() => Promise.resolve({ content: "" }));
  },
}));

mock.module("@langchain/core/messages", () => ({
  SystemMessage: class {
    constructor(public content: string) {}
  },
  HumanMessage: class {
    constructor(public content: string) {}
  },
}));

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
      return { from: mockRlsFrom, storage: { from: mockStorageFrom } };
    }
    // Admin client — used by routes (supabaseAdmin) and auth middleware (getUser)
    return {
      auth: {
        admin: { createUser: mock(), signOut: mockAdminSignOut },
        signInWithPassword: mock(),
        getUser: mockGetUser,
      },
      from: mockAdminFrom,
      storage: { from: mockStorageFrom },
    };
  },
}));

// ---------------------------------------------------------------------------
// Mock account service (deletion logic is unit-tested in account.service.test)
// ---------------------------------------------------------------------------
class MockAccountDeletionError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
const mockDeleteAccount = mock((_userId: string) => Promise.resolve());

// ---------------------------------------------------------------------------
// Mock report generation (onboarding triggers it fire-and-forget)
// ---------------------------------------------------------------------------
const mockGenerateUserReport = mock(
  (_userId: string, _month: Date, _force?: boolean, _client?: unknown, _options?: unknown) =>
    Promise.resolve(null)
);
const mockGenerateHouseholdReport = mock(
  (_householdId: string, _month: Date, _force?: boolean, _client?: unknown, _options?: unknown) =>
    Promise.resolve(null)
);

mock.module("../../services/report.service", () => ({
  generateUserReport: mockGenerateUserReport,
  generateHouseholdReport: mockGenerateHouseholdReport,
}));

mock.module("../../services/account.service", () => ({
  deleteAccount: mockDeleteAccount,
  AccountDeletionError: MockAccountDeletionError,
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
  const { default: profileRouter } = (await import("../profile")) as {
    default: Router;
  };
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
  mockRlsFrom.mockClear();
  mockAdminFrom.mockClear();
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
    Promise.resolve({
      data: { path: `${TEST_USER_ID}/avatar.jpg` },
      error: null,
    })
  );

  mockGetPublicUrl.mockImplementation(() => ({
    data: {
      publicUrl: `https://example.supabase.co/storage/v1/object/public/avatars/${TEST_USER_ID}/avatar.jpg`,
    },
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
      Promise.resolve({
        data: null,
        error: { message: "Not found", code: "PGRST116" },
      })
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
    expect(mockFrom).toHaveBeenCalledTimes(1); // only requireAuth's disabled-account lookup
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

  it("generates this and last month's reports only when they have transactions", async () => {
    mockGenerateUserReport.mockClear();
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: { ...profileData, onboarding_completed: true }, error: null })
    );

    const res = await fetch(url(), {
      method: "PUT",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);

    // Generation runs after the response; let it finish.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockGenerateUserReport).toHaveBeenCalledTimes(2);
    for (const call of mockGenerateUserReport.mock.calls) {
      expect(call[0]).toBe(TEST_USER_ID);
      expect(call[2]).toBe(true);
      // A new account with no statements must not get an all-zero report (it would read as a real score).
      expect(call[4]).toEqual({ skipIfEmpty: true });
    }
  });

  // onboarding_completed is server-owned: clients have no UPDATE grant on it,
  // so the route sets it with the service role.
  it("sets onboarding_completed with the service-role client", async () => {
    const res = await fetch(url(), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    expect(res.status).toBe(200);
    expect(mockAdminFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalledWith({ onboarding_completed: true });
    expect(mockRlsFrom).not.toHaveBeenCalledWith("profiles");
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
      avatar_url:
        "https://example.supabase.co/storage/v1/object/public/avatars/user-123/avatar.jpg?t=123",
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

// ===========================================================================
// DELETE /api/profile — self-service account deletion
// ===========================================================================
describe("DELETE /api/profile", () => {
  const url = () => `${baseUrl}/api/profile`;
  const send = (body?: unknown, auth = true) =>
    fetch(url(), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${TEST_TOKEN}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeEach(() => {
    mockDeleteAccount.mockClear();
    mockDeleteAccount.mockImplementation(() => Promise.resolve());
  });

  it("returns 401 without auth token", async () => {
    const res = await send({ confirm: "DELETE" }, false);
    expect(res.status).toBe(401);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("returns 400 when the confirmation is missing", async () => {
    const res = await send({});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("returns 400 when the confirmation is wrong", async () => {
    const res = await send({ confirm: "delete" });
    expect(res.status).toBe(400);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("deletes the authenticated user's account and returns 200", async () => {
    const res = await send({ confirm: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockDeleteAccount.mock.calls[0][0]).toBe(TEST_USER_ID);
  });

  it("returns 409 with the message when the user must transfer household ownership first", async () => {
    mockDeleteAccount.mockImplementation(() =>
      Promise.reject(
        new MockAccountDeletionError(
          "HOUSEHOLD_HEAD_HAS_MEMBERS",
          "Transfer household ownership first."
        )
      )
    );

    const res = await send({ confirm: "DELETE" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Transfer household ownership first.");
  });

  it("returns 500 with a generic message when deletion fails", async () => {
    mockDeleteAccount.mockImplementation(() =>
      Promise.reject(
        new MockAccountDeletionError("FAILED", "Account deletion failed. Please try again.")
      )
    );

    const res = await send({ confirm: "DELETE" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Account deletion failed. Please try again.");
  });
});

// ===========================================================================
// POST /api/profile/sign-out-others — "Disconnect AI assistants"
// ===========================================================================
describe("POST /api/profile/sign-out-others", () => {
  const url = () => `${baseUrl}/api/profile/sign-out-others`;
  const send = (auth = true) =>
    fetch(url(), {
      method: "POST",
      headers: auth ? { Authorization: `Bearer ${TEST_TOKEN}` } : {},
    });

  beforeEach(() => {
    mockAdminSignOut.mockClear();
    mockAdminSignOut.mockImplementation(() => Promise.resolve({ data: null, error: null }));
  });

  it("returns 401 without auth token", async () => {
    const res = await send(false);
    expect(res.status).toBe(401);
    expect(mockAdminSignOut).not.toHaveBeenCalled();
  });

  it("signs out every other session of the caller, keeping the current one", async () => {
    const res = await send();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signed_out_others: true });
    expect(mockAdminSignOut).toHaveBeenCalledTimes(1);
    expect(mockAdminSignOut.mock.calls[0]).toEqual([TEST_TOKEN, "others"]);
  });

  it("returns 401 when Supabase rejects the caller's session", async () => {
    mockAdminSignOut.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "session not found", status: 403 } })
    );
    const res = await send();
    expect(res.status).toBe(401);
  });

  it("returns 500 with a generic message when sign-out fails", async () => {
    mockAdminSignOut.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "upstream exploded", status: 500 } })
    );
    const res = await send();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Could not sign out other sessions. Please try again.");
  });
});
