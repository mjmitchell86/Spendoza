import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Mock supabase module. oauth.ts imports from "../lib/supabase" which
// resolves to "src/lib/supabase" from the test file's perspective.
// ---------------------------------------------------------------------------
const mockGetUser = mock();
const mockSignIn = mock();
const mockRefreshSession = mock();
const mockInsert = mock(() => ({ error: null }));
const mockMaybeSingle = mock();
const mockUpdateEq = mock(() => ({ error: null }));
const mockUpdate = mock(() => ({ eq: mockUpdateEq }));

// Chain: from().select().eq().eq().maybeSingle()  (for auth codes with 2 eq conditions)
// Chain: from().select().eq().maybeSingle()        (for clients with 1 eq condition)
const mockFromEq2 = mock(() => ({ maybeSingle: mockMaybeSingle }));
const mockFromEq = mock(() => ({ eq: mockFromEq2, maybeSingle: mockMaybeSingle }));
const mockFromSelect = mock(() => ({ eq: mockFromEq }));

const mockFrom = mock(() => ({
  select: mockFromSelect,
  insert: mockInsert,
  update: mockUpdate,
}));

mock.module("../lib/supabase", () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
  createSupabaseClient: mock(() => ({
    auth: {
      signInWithPassword: mockSignIn,
      refreshSession: mockRefreshSession,
    },
  })),
}));

const {
  SpendozaOAuthProvider,
  SupabaseClientsStore,
  handleCallback,
} = await import("../auth/oauth");

type OAuthClientInformationFull = {
  client_id: string;
  client_id_issued_at?: number;
  redirect_uris: URL[];
  [key: string]: unknown;
};

const TEST_CLIENT: OAuthClientInformationFull = {
  client_id: "test-client-id",
  client_id_issued_at: 1000000,
  redirect_uris: [new URL("http://localhost:3000/callback")],
};

describe("SpendozaOAuthProvider", () => {
  let provider: InstanceType<typeof SpendozaOAuthProvider>;

  beforeEach(() => {
    provider = new SpendozaOAuthProvider();
    mockGetUser.mockReset();
    mockMaybeSingle.mockReset();
    mockInsert.mockReset();
    mockInsert.mockReturnValue({ error: null });
    mockRefreshSession.mockReset();
    mockFromEq.mockReset();
    mockFromEq2.mockReset();
    mockFromEq.mockReturnValue({ eq: mockFromEq2, maybeSingle: mockMaybeSingle });
    mockFromEq2.mockReturnValue({ maybeSingle: mockMaybeSingle });
  });

  describe("authorize", () => {
    it("renders a login HTML page", async () => {
      let sentHtml = "";
      let sentStatus = 0;
      const res = {
        status: (code: number) => {
          sentStatus = code;
          return res;
        },
        type: (_t: string) => res,
        send: (html: string) => {
          sentHtml = html;
        },
      } as any;

      await provider.authorize(
        TEST_CLIENT as any,
        {
          redirectUri: "http://localhost:3000/callback",
          codeChallenge: "test-challenge-abc",
          state: "test-state-xyz",
          scopes: ["read"],
        },
        res
      );

      expect(sentStatus).toBe(200);
      expect(sentHtml).toContain("Spendoza");
      expect(sentHtml).toContain("email");
      expect(sentHtml).toContain("password");
      expect(sentHtml).toContain("test-challenge-abc");
      expect(sentHtml).toContain("test-state-xyz");
      expect(sentHtml).toContain("test-client-id");
    });
  });

  describe("challengeForAuthorizationCode", () => {
    it("returns the stored code challenge", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { code_challenge: "stored-challenge" },
        error: null,
      });

      const challenge = await provider.challengeForAuthorizationCode(
        TEST_CLIENT as any,
        "test-auth-code"
      );
      expect(challenge).toBe("stored-challenge");
    });

    it("throws for an invalid auth code", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(
        provider.challengeForAuthorizationCode(TEST_CLIENT as any, "invalid-code")
      ).rejects.toThrow("Invalid or expired authorization code");
    });
  });

  describe("exchangeAuthorizationCode", () => {
    it("returns tokens for a valid auth code", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          code: "valid-code",
          access_token: "sb-access-token",
          refresh_token: "sb-refresh-token",
          expires_in: 3600,
          created_at: new Date().toISOString(),
          used: false,
        },
        error: null,
      });

      const tokens = await provider.exchangeAuthorizationCode(
        TEST_CLIENT as any,
        "valid-code"
      );

      expect(tokens.access_token).toBe("sb-access-token");
      expect(tokens.refresh_token).toBe("sb-refresh-token");
      expect(tokens.token_type).toBe("Bearer");
      expect(tokens.expires_in).toBe(3600);
    });

    it("throws for an expired auth code", async () => {
      const expired = new Date(Date.now() - 11 * 60 * 1000).toISOString();
      mockMaybeSingle.mockResolvedValue({
        data: {
          code: "expired-code",
          access_token: "old-token",
          refresh_token: "old-refresh",
          expires_in: 3600,
          created_at: expired,
          used: false,
        },
        error: null,
      });

      await expect(
        provider.exchangeAuthorizationCode(TEST_CLIENT as any, "expired-code")
      ).rejects.toThrow("expired");
    });

    it("throws for an already-used auth code", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(
        provider.exchangeAuthorizationCode(TEST_CLIENT as any, "used-code")
      ).rejects.toThrow("Invalid or expired authorization code");
    });
  });

  describe("exchangeRefreshToken", () => {
    it("returns new tokens on successful refresh", async () => {
      mockRefreshSession.mockResolvedValue({
        data: {
          session: {
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 3600,
          },
        },
        error: null,
      });

      const tokens = await provider.exchangeRefreshToken(
        TEST_CLIENT as any,
        "valid-refresh-token"
      );

      expect(tokens.access_token).toBe("new-access-token");
      expect(tokens.refresh_token).toBe("new-refresh-token");
      expect(tokens.token_type).toBe("Bearer");
    });

    it("throws when refresh fails", async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: "Invalid refresh token" },
      });

      await expect(
        provider.exchangeRefreshToken(TEST_CLIENT as any, "bad-refresh-token")
      ).rejects.toThrow("Failed to refresh session");
    });
  });

  describe("verifyAccessToken", () => {
    it("returns AuthInfo for a valid token", async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: { id: "user-abc", email: "test@example.com" },
        },
        error: null,
      });

      const info = await provider.verifyAccessToken("valid-token");
      expect(info.token).toBe("valid-token");
      expect(info.clientId).toBe("supabase");
      expect(info.scopes).toEqual([]);
      expect(info.extra?.userId).toBe("user-abc");
      expect(info.extra?.email).toBe("test@example.com");
    });

    it("throws for an invalid token", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid JWT" },
      });

      await expect(
        provider.verifyAccessToken("invalid-token")
      ).rejects.toThrow("Invalid access token");
    });
  });
});

describe("handleCallback", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockInsert.mockReset();
    mockInsert.mockReturnValue({ error: null });
  });

  it("authenticates and returns a redirect URL with auth code", async () => {
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: "user-123" },
        session: {
          access_token: "sb-access",
          refresh_token: "sb-refresh",
          expires_in: 3600,
        },
      },
      error: null,
    });

    const redirectUrl = await handleCallback({
      email: "test@example.com",
      password: "password123",
      client_id: "test-client",
      redirect_uri: "http://localhost:3000/callback",
      code_challenge: "challenge-abc",
      state: "state-xyz",
    });

    const url = new URL(redirectUrl);
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname).toBe("/callback");
    expect(url.searchParams.get("code")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe("state-xyz");

    // Verify insert was called
    expect(mockInsert).toHaveBeenCalled();
  });

  it("throws on authentication failure", async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    await expect(
      handleCallback({
        email: "test@example.com",
        password: "wrong-password",
        client_id: "test-client",
        redirect_uri: "http://localhost:3000/callback",
        code_challenge: "challenge-abc",
      })
    ).rejects.toThrow("Invalid login credentials");
  });

  it("includes state param only when provided", async () => {
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: "user-123" },
        session: {
          access_token: "sb-access",
          refresh_token: "sb-refresh",
          expires_in: 3600,
        },
      },
      error: null,
    });

    const redirectUrl = await handleCallback({
      email: "test@example.com",
      password: "password123",
      client_id: "test-client",
      redirect_uri: "http://localhost:3000/callback",
      code_challenge: "challenge-abc",
    });

    const url = new URL(redirectUrl);
    expect(url.searchParams.has("state")).toBe(false);
    expect(url.searchParams.get("code")).toBeTruthy();
  });
});

describe("SupabaseClientsStore", () => {
  let store: InstanceType<typeof SupabaseClientsStore>;

  beforeEach(() => {
    store = new SupabaseClientsStore();
    mockMaybeSingle.mockReset();
    mockInsert.mockReset();
    mockInsert.mockReturnValue({ error: null });
    mockFromEq.mockReset();
    mockFromEq.mockReturnValue({ eq: mockFromEq2, maybeSingle: mockMaybeSingle });
  });

  describe("getClient", () => {
    it("returns client data for a known client", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { client_data: TEST_CLIENT },
        error: null,
      });

      const client = await store.getClient("test-client-id");
      expect(client).toBeDefined();
      expect(client!.client_id).toBe("test-client-id");
    });

    it("returns undefined for an unknown client", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      const client = await store.getClient("unknown-client");
      expect(client).toBeUndefined();
    });
  });

  describe("registerClient", () => {
    it("registers a new client and returns full info", async () => {
      const { client_id, client_id_issued_at, ...metadata } = TEST_CLIENT;
      const result = await store.registerClient(metadata as any);

      expect(result.client_id).toBeTruthy();
      expect(result.client_id_issued_at).toBeGreaterThan(0);
      expect(result.redirect_uris.length).toBe(TEST_CLIENT.redirect_uris.length);
      expect(mockInsert).toHaveBeenCalled();
    });
  });
});
