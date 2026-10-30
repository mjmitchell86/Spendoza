import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";

const signOut = mock(() => Promise.resolve({ error: null }));
mock.module("../supabase", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: "tok" } } }),
      signOut,
    },
  },
}));

const { apiClient } = await import("../api");
const { ApiError } = await import("../api-error");

const MESSAGE =
  "This account has been disabled. Email hello@gravitaz.net if you think this is a mistake.";

describe("apiClient disabled accounts", () => {
  const realFetch = globalThis.fetch;
  let assign: ReturnType<typeof spyOn>;

  beforeEach(() => {
    signOut.mockClear();
    assign = spyOn(window.location, "assign").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    assign.mockRestore();
  });

  function respond(status: number, body: unknown) {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status })),
    ) as unknown as typeof fetch;
  }

  it("signs out and sends the person to Sign in on a 403 account_disabled", async () => {
    respond(403, { error: MESSAGE, code: "account_disabled" });
    await expect(apiClient("/profile")).rejects.toBeInstanceOf(ApiError);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login?notice=account_disabled");
  });

  it("leaves other 403s alone", async () => {
    respond(403, { error: "Upgrade", required_tier: "pro" });
    await expect(apiClient("/profile")).rejects.toBeInstanceOf(ApiError);
    expect(signOut).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
