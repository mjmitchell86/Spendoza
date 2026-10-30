import { describe, it, expect, beforeEach, mock } from "bun:test";

let profileResult: { data: unknown; error: unknown } = { data: null, error: null };

mock.module("../../lib/supabase", () => ({
  supabaseAdmin: {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: "user-1", email: "a@test.com" } }, error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(profileResult) }) }),
    }),
  },
  createSupabaseClient: () => ({}),
}));

const { requireAuth } = await import("../auth");

function run() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  const next = mock();
  const req: any = { headers: { authorization: "Bearer good" } };
  return requireAuth(req, res, next).then(() => ({ res, next, req }));
}

describe("requireAuth disabled accounts", () => {
  beforeEach(() => {
    profileResult = { data: null, error: null };
  });

  it("answers 403 account_disabled for a disabled profile", async () => {
    profileResult = { data: { disabled: true }, error: null };
    const { res, next } = await run();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: "This account has been disabled. Email hello@gravitaz.net if you think this is a mistake.",
      code: "account_disabled",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("lets an enabled profile through", async () => {
    profileResult = { data: { disabled: false }, error: null };
    const { next, req } = await run();
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe("user-1");
  });

  it("lets a missing profile row through", async () => {
    const { next } = await run();
    expect(next).toHaveBeenCalled();
  });

  it("fails open when the profile lookup throws", async () => {
    profileResult = Promise.reject(new Error("socket hang up")) as any;
    const { next } = await run();
    expect(next).toHaveBeenCalled();
  });

  it("fails open when the profile lookup errors", async () => {
    profileResult = { data: null, error: { message: "db down" } };
    const { next } = await run();
    expect(next).toHaveBeenCalled();
  });
});
