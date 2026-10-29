import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const USER_ID = "user-123";
const USER_EMAIL = "Person@Example.com";
const HEAD_ID = "head-456";
const HOUSEHOLD_ID = "hh-789";

// ---------------------------------------------------------------------------
// Recording fake for supabaseAdmin
//
// Every query/storage/auth call is pushed to `ops` (in execution order) so tests
// can assert on what was done and in which order. Results are configured per
// `${table}.${action}` and may be a function of the recorded op.
// ---------------------------------------------------------------------------
type Filter = [string, string, any];
interface Op {
  kind: "db" | "storage" | "auth" | "stripe";
  table?: string;
  action: string;
  payload?: any;
  filters: Filter[];
}

let ops: Op[] = [];
let dbResults: Record<string, any> = {};
let storageFiles: Record<string, Record<string, any[]>> = {};
let storageRemoveError: any = null;
let authUser: any = null;
let authGetError: any = null;
let authDeleteError: any = null;

function filterValue(op: Op, col: string) {
  return op.filters.find((f) => f[1] === col)?.[2];
}

function fakeQuery(table: string) {
  const op: Op = { kind: "db", table, action: "select", filters: [] };
  let recorded = false;
  const resolve = () => {
    if (!recorded) {
      ops.push(op);
      recorded = true;
    }
    const r = dbResults[`${table}.${op.action}`];
    return Promise.resolve(
      (typeof r === "function" ? r(op) : r) ?? { data: null, error: null }
    );
  };
  const b: any = {
    select: () => b,
    update: (payload: any) => {
      op.action = "update";
      op.payload = payload;
      return b;
    },
    delete: () => {
      op.action = "delete";
      return b;
    },
    eq: (col: string, val: any) => {
      op.filters.push(["eq", col, val]);
      return b;
    },
    neq: (col: string, val: any) => {
      op.filters.push(["neq", col, val]);
      return b;
    },
    single: resolve,
    maybeSingle: resolve,
    then: (res: any, rej?: any) => resolve().then(res, rej),
  };
  return b;
}

const fakeAdmin = {
  from: (table: string) => fakeQuery(table),
  storage: {
    from: (bucket: string) => ({
      list: (prefix: string, opts?: any) => {
        ops.push({ kind: "storage", table: bucket, action: "list", payload: prefix, filters: [] });
        const all = storageFiles[bucket]?.[prefix] ?? [];
        const offset = opts?.offset ?? 0;
        const limit = opts?.limit ?? 100;
        return Promise.resolve({ data: all.slice(offset, offset + limit), error: null });
      },
      remove: (paths: string[]) => {
        ops.push({ kind: "storage", table: bucket, action: "remove", payload: paths, filters: [] });
        return Promise.resolve({ data: [], error: storageRemoveError });
      },
    }),
  },
  auth: {
    admin: {
      getUserById: (id: string) => {
        ops.push({ kind: "auth", action: "getUserById", payload: id, filters: [] });
        return Promise.resolve({ data: { user: authUser }, error: authGetError });
      },
      deleteUser: (id: string) => {
        ops.push({ kind: "auth", action: "deleteUser", payload: id, filters: [] });
        return Promise.resolve({ data: {}, error: authDeleteError });
      },
    },
  },
};

mock.module("../../lib/supabase", () => ({
  supabaseAdmin: fakeAdmin,
  createSupabaseClient: () => fakeAdmin,
}));

// ---------------------------------------------------------------------------
// Stripe mock
// ---------------------------------------------------------------------------
let stripeSubStatus = "active";
let stripeCancelError: any = null;
let stripeDelError: any = null;
let stripeRetrieveError: any = null;

mock.module("stripe", () => ({
  default: class {
    subscriptions = {
      retrieve: (id: string) => {
        ops.push({ kind: "stripe", action: "subscriptions.retrieve", payload: id, filters: [] });
        return stripeRetrieveError
          ? Promise.reject(stripeRetrieveError)
          : Promise.resolve({ id, status: stripeSubStatus });
      },
      cancel: (id: string) => {
        ops.push({ kind: "stripe", action: "subscriptions.cancel", payload: id, filters: [] });
        return stripeCancelError
          ? Promise.reject(stripeCancelError)
          : Promise.resolve({ id, status: "canceled" });
      },
    };
    customers = {
      del: (id: string) => {
        ops.push({ kind: "stripe", action: "customers.del", payload: id, filters: [] });
        return stripeDelError
          ? Promise.reject(stripeDelError)
          : Promise.resolve({ id, deleted: true });
      },
    };
  },
}));

const { deleteAccount, AccountDeletionError } = await import("../account.service");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const originalStripeKey = process.env.STRIPE_SECRET_KEY;
let logged: string[] = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function dbOps(table: string, action?: string) {
  return ops.filter((o) => o.kind === "db" && o.table === table && (!action || o.action === action));
}

function indexOf(pred: (o: Op) => boolean) {
  return ops.findIndex(pred);
}

function setProfile(householdId: string | null) {
  dbResults["profiles.select"] = (op: Op) => {
    if (filterValue(op, "id") === USER_ID) {
      return { data: { id: USER_ID, household_id: householdId }, error: null };
    }
    return { data: null, error: null };
  };
}

function setHousehold(headId: string, memberIds: string[]) {
  dbResults["households.select"] = {
    data: { id: HOUSEHOLD_ID, head_of_household_id: headId },
    error: null,
  };
  const base = dbResults["profiles.select"];
  dbResults["profiles.select"] = (op: Op) => {
    if (filterValue(op, "household_id") === HOUSEHOLD_ID) {
      return { data: memberIds.map((id) => ({ id })), error: null };
    }
    return base(op);
  };
}

beforeEach(() => {
  ops = [];
  dbResults = {};
  storageFiles = {};
  storageRemoveError = null;
  authUser = { id: USER_ID, email: USER_EMAIL };
  authGetError = null;
  authDeleteError = null;
  stripeSubStatus = "active";
  stripeCancelError = null;
  stripeDelError = null;
  stripeRetrieveError = null;
  delete process.env.STRIPE_SECRET_KEY;
  setProfile(null);

  logged = [];
  const capture = (...args: any[]) => {
    logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.log = capture;
  console.error = capture;
  console.warn = capture;
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
  if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalStripeKey;
});

// ===========================================================================
// deleteAccount
// ===========================================================================
describe("deleteAccount", () => {
  it("throws NOT_FOUND and deletes nothing when the auth user does not exist", async () => {
    authUser = null;
    authGetError = { message: "User not found", status: 404 };

    const err = await deleteAccount(USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(AccountDeletionError);
    expect(err.code).toBe("NOT_FOUND");
    expect(ops.some((o) => o.action === "deleteUser")).toBe(false);
    expect(ops.some((o) => o.kind === "db" && o.action !== "select")).toBe(false);
  });

  it("removes all user data for a user with no household or subscription, deleting the auth user last", async () => {
    storageFiles = {
      avatars: {
        [USER_ID]: [{ name: "avatar.jpg", id: "obj-1" }],
      },
      "bank-statements": {
        [USER_ID]: [{ name: "statements", id: null }],
        [`${USER_ID}/statements`]: [
          { name: "jan.pdf", id: "obj-2" },
          { name: "feb.csv", id: "obj-3" },
        ],
      },
    };

    await deleteAccount(USER_ID);

    // Invitations they sent and invitations addressed to them
    const invDeletes = dbOps("household_invitations", "delete");
    expect(invDeletes.some((o) => filterValue(o, "invited_by") === USER_ID)).toBe(true);
    expect(invDeletes.some((o) => filterValue(o, "email") === USER_EMAIL.toLowerCase())).toBe(true);

    // Attribution on other users' rows is cleared
    for (const table of ["income_entries", "transactions"]) {
      const upd = dbOps(table, "update");
      expect(upd).toHaveLength(1);
      expect(upd[0].payload).toEqual({ attributed_to_user_id: null });
      expect(filterValue(upd[0], "attributed_to_user_id")).toBe(USER_ID);
    }

    // Personal reports (no FK, so not cascaded)
    const reportDeletes = dbOps("reports", "delete");
    expect(
      reportDeletes.some(
        (o) => filterValue(o, "entity_type") === "user" && filterValue(o, "entity_id") === USER_ID
      )
    ).toBe(true);

    // Storage objects in both buckets (recursing into folders)
    const removes = ops.filter((o) => o.kind === "storage" && o.action === "remove");
    const removed = removes.flatMap((o) => (o.payload as string[]).map((p) => `${o.table}:${p}`));
    expect(removed.sort()).toEqual(
      [
        `avatars:${USER_ID}/avatar.jpg`,
        `bank-statements:${USER_ID}/statements/feb.csv`,
        `bank-statements:${USER_ID}/statements/jan.pdf`,
      ].sort()
    );

    // Waitlist row matched by (lowercased) email
    const wl = dbOps("waitlist", "delete");
    expect(wl).toHaveLength(1);
    expect(filterValue(wl[0], "email")).toBe(USER_EMAIL.toLowerCase());

    // No household changes for a user without a household
    expect(dbOps("households", "delete")).toHaveLength(0);

    // Auth user (cascades to profile and all FK'd tables) is deleted after all cleanup
    const authDeleteIdx = indexOf((o) => o.action === "deleteUser");
    expect(authDeleteIdx).toBeGreaterThan(-1);
    expect(ops[authDeleteIdx].payload).toBe(USER_ID);
    const lastCleanupIdx = Math.max(
      indexOf((o) => o.table === "waitlist"),
      ...removes.map((r) => ops.indexOf(r)),
      indexOf((o) => o.table === "income_entries"),
      indexOf((o) => o.table === "transactions")
    );
    expect(authDeleteIdx).toBeGreaterThan(lastCleanupIdx);
  });

  it("does not log the user's email", async () => {
    await deleteAccount(USER_ID);
    expect(logged.join("\n").toLowerCase()).not.toContain(USER_EMAIL.toLowerCase());
  });

  it("household member: leaves the household and hands their household goals/debts to the head", async () => {
    setProfile(HOUSEHOLD_ID);
    setHousehold(HEAD_ID, [HEAD_ID, USER_ID]);

    await deleteAccount(USER_ID);

    for (const table of ["goals", "debts"]) {
      const upd = dbOps(table, "update");
      expect(upd).toHaveLength(1);
      expect(upd[0].payload).toEqual({ user_id: HEAD_ID });
      expect(filterValue(upd[0], "user_id")).toBe(USER_ID);
      expect(filterValue(upd[0], "entity_type")).toBe("household");
      expect(filterValue(upd[0], "entity_id")).toBe(HOUSEHOLD_ID);
    }

    // Household reports are flagged so they regenerate without this user's data
    const reportUpd = dbOps("reports", "update");
    expect(reportUpd).toHaveLength(1);
    expect(reportUpd[0].payload).toEqual({ has_new_data: true });
    expect(filterValue(reportUpd[0], "entity_id")).toBe(HOUSEHOLD_ID);

    const leave = dbOps("profiles", "update");
    expect(leave).toHaveLength(1);
    expect(leave[0].payload).toEqual({ household_id: null });
    expect(filterValue(leave[0], "id")).toBe(USER_ID);

    expect(dbOps("households", "delete")).toHaveLength(0);
    expect(ops.some((o) => o.action === "deleteUser")).toBe(true);
  });

  it("head who is the sole member: deletes the household and its reports", async () => {
    setProfile(HOUSEHOLD_ID);
    setHousehold(USER_ID, [USER_ID]);

    await deleteAccount(USER_ID);

    const hhDelete = dbOps("households", "delete");
    expect(hhDelete).toHaveLength(1);
    expect(filterValue(hhDelete[0], "id")).toBe(HOUSEHOLD_ID);

    const hhReportDelete = dbOps("reports", "delete").filter(
      (o) => filterValue(o, "entity_type") === "household"
    );
    expect(hhReportDelete).toHaveLength(1);
    expect(filterValue(hhReportDelete[0], "entity_id")).toBe(HOUSEHOLD_ID);

    // Goals/debts are not reassigned (no one to hand them to)
    expect(dbOps("goals", "update")).toHaveLength(0);
    expect(dbOps("debts", "update")).toHaveLength(0);

    expect(indexOf((o) => o.action === "deleteUser")).toBeGreaterThan(
      ops.indexOf(hhDelete[0])
    );
  });

  it("head with other members: refuses with HOUSEHOLD_HEAD_HAS_MEMBERS and changes nothing", async () => {
    setProfile(HOUSEHOLD_ID);
    setHousehold(USER_ID, [USER_ID, "other-member"]);
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    dbResults["subscriptions.select"] = {
      data: { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" },
      error: null,
    };

    const err = await deleteAccount(USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(AccountDeletionError);
    expect(err.code).toBe("HOUSEHOLD_HEAD_HAS_MEMBERS");
    expect(err.message).toMatch(/transfer/i);
    expect(ops.some((o) => o.kind === "db" && o.action !== "select")).toBe(false);
    expect(ops.some((o) => o.kind === "storage" || o.kind === "stripe")).toBe(false);
    expect(ops.some((o) => o.action === "deleteUser")).toBe(false);
  });

  it("cancels the Stripe subscription and deletes the customer before deleting the auth user", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    dbResults["subscriptions.select"] = {
      data: { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" },
      error: null,
    };

    await deleteAccount(USER_ID);

    const cancelIdx = indexOf((o) => o.action === "subscriptions.cancel");
    const delIdx = indexOf((o) => o.action === "customers.del");
    expect(cancelIdx).toBeGreaterThan(-1);
    expect(ops[cancelIdx].payload).toBe("sub_1");
    expect(delIdx).toBeGreaterThan(cancelIdx);
    expect(ops[delIdx].payload).toBe("cus_1");
    expect(indexOf((o) => o.action === "deleteUser")).toBeGreaterThan(delIdx);
  });

  it("skips cancelling a subscription that is already canceled but still deletes the customer", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    stripeSubStatus = "canceled";
    dbResults["subscriptions.select"] = {
      data: { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" },
      error: null,
    };

    await deleteAccount(USER_ID);

    expect(ops.some((o) => o.action === "subscriptions.cancel")).toBe(false);
    expect(ops.some((o) => o.action === "customers.del")).toBe(true);
  });

  it("treats Stripe objects that no longer exist as already removed", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    stripeRetrieveError = Object.assign(new Error("No such subscription"), { code: "resource_missing" });
    stripeDelError = Object.assign(new Error("No such customer"), { code: "resource_missing" });
    dbResults["subscriptions.select"] = {
      data: { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" },
      error: null,
    };

    await deleteAccount(USER_ID);

    expect(ops.some((o) => o.action === "deleteUser")).toBe(true);
  });

  it("makes no Stripe calls when Stripe is not configured", async () => {
    dbResults["subscriptions.select"] = {
      data: { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" },
      error: null,
    };

    await deleteAccount(USER_ID);

    expect(ops.some((o) => o.kind === "stripe")).toBe(false);
    expect(ops.some((o) => o.action === "deleteUser")).toBe(true);
  });

  it("aborts without deleting data or the auth user when Stripe cancellation fails", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    stripeCancelError = Object.assign(new Error("Stripe is down"), { code: "api_error" });
    dbResults["subscriptions.select"] = {
      data: { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" },
      error: null,
    };
    storageFiles = { avatars: { [USER_ID]: [{ name: "avatar.jpg", id: "obj-1" }] } };

    const err = await deleteAccount(USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(AccountDeletionError);
    expect(err.code).toBe("FAILED");
    expect(ops.some((o) => o.action === "deleteUser")).toBe(false);
    expect(ops.some((o) => o.kind === "storage" && o.action === "remove")).toBe(false);
    expect(dbOps("reports", "delete")).toHaveLength(0);
    expect(dbOps("waitlist", "delete")).toHaveLength(0);
  });

  it("aborts before deleting the auth user when a database cleanup step fails", async () => {
    dbResults["transactions.update"] = { data: null, error: { message: "boom" } };

    const err = await deleteAccount(USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(AccountDeletionError);
    expect(err.code).toBe("FAILED");
    expect(ops.some((o) => o.action === "deleteUser")).toBe(false);
  });

  it("aborts before deleting the auth user when storage removal fails", async () => {
    storageFiles = { avatars: { [USER_ID]: [{ name: "avatar.jpg", id: "obj-1" }] } };
    storageRemoveError = { message: "storage unavailable" };

    const err = await deleteAccount(USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(AccountDeletionError);
    expect(err.code).toBe("FAILED");
    expect(ops.some((o) => o.action === "deleteUser")).toBe(false);
  });

  it("pages through large storage folders", async () => {
    const many = Array.from({ length: 1500 }, (_, i) => ({ name: `f${i}.pdf`, id: `o${i}` }));
    storageFiles = {
      "bank-statements": {
        [USER_ID]: [{ name: "statements", id: null }],
        [`${USER_ID}/statements`]: many,
      },
    };

    await deleteAccount(USER_ID);

    const removed = ops
      .filter((o) => o.kind === "storage" && o.action === "remove" && o.table === "bank-statements")
      .flatMap((o) => o.payload as string[]);
    expect(new Set(removed).size).toBe(1500);
  });

  it("throws FAILED when deleting the auth user fails", async () => {
    authDeleteError = { message: "Database error deleting user" };

    const err = await deleteAccount(USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(AccountDeletionError);
    expect(err.code).toBe("FAILED");
  });
});
