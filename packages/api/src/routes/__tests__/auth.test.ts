import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Mock functions we will assert on
// ---------------------------------------------------------------------------
const mockCreateUser = mock(() =>
  Promise.resolve({
    data: {
      user: {
        id: "user-123",
        email: "test@example.com",
        user_metadata: { display_name: "Test User" },
      },
    },
    error: null,
  })
);

const mockSignInWithPassword = mock(() =>
  Promise.resolve({
    data: {
      session: {
        access_token: "access-token-abc",
        refresh_token: "refresh-token-xyz",
      },
      user: {
        id: "user-123",
        email: "test@example.com",
      },
    },
    error: null,
  })
);

// ---------------------------------------------------------------------------
// Mock for supabaseAdmin.from() chains (invite_codes table)
// ---------------------------------------------------------------------------
let mockSelectResult: { data: unknown; error: unknown } = {
  data: { id: "code-1" },
  error: null,
};
let mockUpdateResult: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};

function createChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  chain.select = handler;
  chain.update = handler;
  chain.eq = handler;
  chain.is = handler;
  chain.single = () => Promise.resolve(result);
  // For update chains that don't end with .single()
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

const mockFrom = mock((table: string) => {
  // Return different chain depending on the operation
  // The select chain (for validation) always comes first in the route
  return {
    select: (..._args: unknown[]) => createChain(mockSelectResult),
    update: (..._args: unknown[]) => createChain(mockUpdateResult),
  };
});

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js BEFORE any import that depends on it.
// We mock the entire package so supabase.ts's createClient returns our stubs.
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        createUser: mockCreateUser,
      },
      signInWithPassword: mockSignInWithPassword,
    },
    from: mockFrom,
  }),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // Dynamic import AFTER mock.module so the mock is in place
  const express = (await import("express")).default;
  const { default: authRouter } = (await import("../auth")) as { default: Router };

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);

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
  mockCreateUser.mockClear();
  mockSignInWithPassword.mockClear();
  mockFrom.mockClear();

  // Reset invite code mocks to successful defaults
  mockSelectResult = { data: { id: "code-1" }, error: null };
  mockUpdateResult = { data: null, error: null };

  // Reset to successful defaults
  mockCreateUser.mockImplementation(() =>
    Promise.resolve({
      data: {
        user: {
          id: "user-123",
          email: "test@example.com",
          user_metadata: { display_name: "Test User" },
        },
      },
      error: null,
    })
  );

  mockSignInWithPassword.mockImplementation(() =>
    Promise.resolve({
      data: {
        session: {
          access_token: "access-token-abc",
          refresh_token: "refresh-token-xyz",
        },
        user: {
          id: "user-123",
          email: "test@example.com",
        },
      },
      error: null,
    })
  );
});

// ===========================================================================
// POST /api/auth/signup
// ===========================================================================
describe("POST /api/auth/signup", () => {
  const url = () => `${baseUrl}/api/auth/signup`;

  it("returns 201 and user on successful signup", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass1",
        display_name: "Test User",
        invite_code: "Chloe14",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe("user-123");
    expect(body.user.email).toBe("test@example.com");

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    const callArg = mockCreateUser.mock.calls[0][0];
    expect(callArg.email).toBe("test@example.com");
    expect(callArg.password).toBe("securepass1");
    expect(callArg.email_confirm).toBe(true);
    expect(callArg.user_metadata.display_name).toBe("Test User");
  });

  it("returns 400 when validation fails (missing invite_code)", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass1",
        display_name: "Test User",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 when validation fails (missing display_name)", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass1",
        invite_code: "Chloe14",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 when validation fails (short password)", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "short",
        display_name: "Test User",
        invite_code: "Chloe14",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 when validation fails (invalid email)", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "not-an-email",
        password: "securepass1",
        display_name: "Test User",
        invite_code: "Chloe14",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 when invite code is invalid or already used", async () => {
    mockSelectResult = {
      data: null,
      error: { message: "No rows found", code: "PGRST116" },
    };

    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass1",
        display_name: "Test User",
        invite_code: "INVALID_CODE",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid or already-used invite code");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 when supabase returns an error", async () => {
    mockCreateUser.mockImplementation(() =>
      Promise.resolve({
        data: { user: null },
        error: { message: "User already registered", status: 400 },
      })
    );

    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass1",
        display_name: "Test User",
        invite_code: "Chloe14",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("User already registered");
  });
});

// ===========================================================================
// POST /api/auth/login
// ===========================================================================
describe("POST /api/auth/login", () => {
  const url = () => `${baseUrl}/api/auth/login`;

  it("returns 200 with session and user on successful login", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass1",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session).toBeDefined();
    expect(body.session.access_token).toBe("access-token-abc");
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe("user-123");

    expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);
    const callArg = mockSignInWithPassword.mock.calls[0][0];
    expect(callArg.email).toBe("test@example.com");
    expect(callArg.password).toBe("securepass1");
  });

  it("returns 400 when validation fails (missing password)", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns 401 when supabase returns an auth error", async () => {
    mockSignInWithPassword.mockImplementation(() =>
      Promise.resolve({
        data: { session: null, user: null },
        error: { message: "Invalid login credentials", status: 400 },
      })
    );

    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "wrongpassword",
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid login credentials");
  });
});

// ===========================================================================
// POST /api/auth/logout
// ===========================================================================
describe("POST /api/auth/logout", () => {
  const url = () => `${baseUrl}/api/auth/logout`;

  it("returns 200 with logout message", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Logged out");
  });
});
