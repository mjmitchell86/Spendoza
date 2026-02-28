import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import type { Server } from "http";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-integration-1";
const TEST_EMAIL = "integration@example.com";
const TEST_TOKEN = "integration-access-token";

const profileData = {
  id: TEST_USER_ID,
  display_name: "Integration User",
  onboarding_completed: false,
  household_id: null,
  income_sharing_mode: "all" as const,
  shared_income_amount: null,
  expense_sharing_mode: "all" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Configurable mock results keyed by table
// ---------------------------------------------------------------------------
let rlsResults: Record<string, any> = {};

function buildRlsChain(table: string) {
  const cfg = rlsResults[table] || {};

  const makeEqChain = (): any => ({
    eq: () => makeEqChain(),
    is: () => makeEqChain(),
    gte: () => makeEqChain(),
    lt: () => makeEqChain(),
    single: () =>
      Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
    maybeSingle: () =>
      Promise.resolve(
        cfg.selectMaybeSingle ?? cfg.selectSingle ?? { data: null, error: null }
      ),
    order: () =>
      Promise.resolve(cfg.selectList ?? { data: [], error: null }),
    then: (resolve: any, reject?: any) => {
      const result = cfg.selectList ?? { data: [], error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  });

  return {
    select: (..._args: any[]) => makeEqChain(),
    insert: (data: any) => ({
      select: () => ({
        single: () =>
          Promise.resolve(cfg.insertSingle ?? { data: null, error: null }),
      }),
    }),
    update: (data: any) => {
      const makeUpdateEq = (): any => ({
        eq: () => makeUpdateEq(),
        select: () => ({
          single: () =>
            Promise.resolve(cfg.updateSingle ?? { data: null, error: null }),
        }),
      });
      return { eq: () => makeUpdateEq() };
    },
  };
}

// ---------------------------------------------------------------------------
// Mock functions
// ---------------------------------------------------------------------------
const mockCreateUser = mock(() =>
  Promise.resolve({
    data: {
      user: {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        user_metadata: { display_name: "Integration User" },
      },
    },
    error: null,
  })
);

const mockSignInWithPassword = mock(() =>
  Promise.resolve({
    data: {
      session: {
        access_token: TEST_TOKEN,
        refresh_token: "refresh-token-xyz",
      },
      user: {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
      },
    },
    error: null,
  })
);

const mockGetUser = mock(() =>
  Promise.resolve({
    data: {
      user: {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
      },
    },
    error: null,
  })
);

const mockRlsFrom = mock((table: string) => buildRlsChain(table));

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    if (options?.global?.headers?.Authorization) {
      return { from: mockRlsFrom };
    }
    return {
      auth: {
        admin: { createUser: mockCreateUser },
        signInWithPassword: mockSignInWithPassword,
        getUser: mockGetUser,
      },
      from: mockRlsFrom,
    };
  },
}));

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: authRouter } = await import("../../routes/auth");
  const { default: profileRouter } = await import("../../routes/profile");
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
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

// ===========================================================================
// Auth Flow Integration Test
// Signup -> Login -> Get profile -> Update profile -> Complete onboarding
// ===========================================================================
describe("Auth Flow: Signup -> Login -> Profile -> Onboarding", () => {
  it("Step 1: Signs up a new user", async () => {
    // Set up invite code mock
    rlsResults["invite_codes"] = {
      selectSingle: { data: { id: "invite-code-1" }, error: null },
    };

    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: "securepass123",
        display_name: "Integration User",
        invite_code: "Chloe14",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(TEST_USER_ID);
    expect(body.user.email).toBe(TEST_EMAIL);
    expect(body.user.user_metadata.display_name).toBe("Integration User");
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
  });

  it("Step 2: Logs in with the new account", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: "securepass123",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session).toBeDefined();
    expect(body.session.access_token).toBe(TEST_TOKEN);
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(TEST_USER_ID);
    expect(mockSignInWithPassword).toHaveBeenCalled();
  });

  it("Step 3: Retrieves the user profile", async () => {
    rlsResults = {
      profiles: {
        selectSingle: { data: profileData, error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/profile`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(TEST_USER_ID);
    expect(body.display_name).toBe("Integration User");
    expect(body.onboarding_completed).toBe(false);
    expect(mockGetUser).toHaveBeenCalled();
  });

  it("Step 4: Updates the profile display name", async () => {
    const updatedProfile = {
      ...profileData,
      display_name: "Updated Integration User",
      updated_at: "2026-01-02T00:00:00Z",
    };

    rlsResults = {
      profiles: {
        selectSingle: { data: updatedProfile, error: null },
        updateSingle: { data: updatedProfile, error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        display_name: "Updated Integration User",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.display_name).toBe("Updated Integration User");
  });

  it("Step 5: Completes onboarding", async () => {
    const onboardedProfile = {
      ...profileData,
      display_name: "Updated Integration User",
      onboarding_completed: true,
    };

    rlsResults = {
      profiles: {
        updateSingle: { data: onboardedProfile, error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/profile/onboarding`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.onboarding_completed).toBe(true);
  });

  it("Step 6: Logs out", async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Logged out");
  });

  it("Step 7: Cannot access profile without auth after logout", async () => {
    const res = await fetch(`${baseUrl}/api/profile`);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization header");
  });
});
