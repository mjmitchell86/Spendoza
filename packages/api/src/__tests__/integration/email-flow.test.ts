import { describe, it, expect, beforeAll, afterAll, mock, beforeEach } from "bun:test";
import type { Server } from "http";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-email-1";
const TEST_EMAIL = "email-test@example.com";
const TEST_HOUSEHOLD_ID = "hh-email-1";
const CRON_SECRET = "test-cron-secret-email";
const TEST_JOB_ID = "job-email-1";

// ---------------------------------------------------------------------------
// Configurable mock results keyed by table
// ---------------------------------------------------------------------------
let adminResults: Record<string, any> = {};
const adminCalls: Array<{ table: string; op: string; args?: any }> = [];

function buildChain(results: Record<string, any>, calls: typeof adminCalls) {
  return (table: string) => {
    const cfg = results[table] || {};

    const makeEqChain = (depth = 0): any => ({
      eq: (...args: any[]) => makeEqChain(depth + 1),
      gte: (...args: any[]) => makeEqChain(depth + 1),
      gt: (...args: any[]) => makeEqChain(depth + 1),
      lte: (...args: any[]) => makeEqChain(depth + 1),
      lt: (...args: any[]) => makeEqChain(depth + 1),
      or: (...args: any[]) => makeEqChain(depth + 1),
      is: (...args: any[]) => makeEqChain(depth + 1),
      not: (...args: any[]) => makeEqChain(depth + 1),
      in: (...args: any[]) => makeEqChain(depth + 1),
      order: (...args: any[]) => makeEqChain(depth + 1),
      limit: (...args: any[]) => makeEqChain(depth + 1),
      single: () =>
        Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
      maybeSingle: () =>
        Promise.resolve(
          cfg.selectMaybeSingle ?? cfg.selectSingle ?? { data: null, error: null }
        ),
      then: (resolve: any, reject?: any) => {
        const result = cfg.selectList ?? { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    });

    return {
      select: (...selectArgs: any[]) => {
        calls.push({ table, op: "select", args: selectArgs });
        return makeEqChain();
      },
      insert: (data: any) => {
        calls.push({ table, op: "insert", args: data });
        return {
          select: () => ({
            single: () =>
              Promise.resolve(cfg.insertSingle ?? { data: null, error: null }),
          }),
          then: (resolve: any, reject?: any) => {
            const result = cfg.insertResult ?? { data: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          },
        };
      },
      update: (data: any) => {
        calls.push({ table, op: "update", args: data });
        const makeUpdateEq = (): any => ({
          eq: () => makeUpdateEq(),
          select: () => ({
            single: () =>
              Promise.resolve(
                cfg.upsertSingle ?? cfg.updateSingle ?? { data: null, error: null }
              ),
          }),
          then: (resolve: any, reject?: any) => {
            const result = cfg.updateResult ?? { data: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          },
        });
        return { eq: () => makeUpdateEq() };
      },
      upsert: (data: any) => {
        calls.push({ table, op: "upsert", args: data });
        return {
          select: () => ({
            single: () =>
              Promise.resolve(cfg.upsertSingle ?? { data: null, error: null }),
          }),
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve(cfg.upsertSingle ?? { data: null, error: null }),
            }),
          }),
          then: (resolve: any, reject?: any) => {
            const result = cfg.upsertResult ?? { data: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          },
        };
      },
      delete: () => {
        calls.push({ table, op: "delete" });
        return {
          eq: () => ({
            eq: () =>
              Promise.resolve(cfg.deleteResult ?? { data: null, error: null }),
          }),
        };
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Mock supabaseAdmin auth
// ---------------------------------------------------------------------------
const mockGetUserById = mock(() =>
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

const mockAdminFrom = mock((...args: any[]) =>
  buildChain(adminResults, adminCalls)(args[0])
);

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    if (options?.global?.headers?.Authorization) {
      return { from: mockAdminFrom };
    }
    return {
      auth: {
        admin: {
          getUserById: mockGetUserById,
          createUser: mock(),
        },
        signInWithPassword: mock(),
        getUser: mock(() =>
          Promise.resolve({
            data: {
              user: { id: TEST_USER_ID, email: TEST_EMAIL },
            },
            error: null,
          })
        ),
      },
      from: mockAdminFrom,
    };
  },
}));

// ---------------------------------------------------------------------------
// Mock email service
// ---------------------------------------------------------------------------
const mockSendReportEmail = mock(() =>
  Promise.resolve({ success: true, emailId: "email-123" })
);

mock.module("../../services/email.service", () => ({
  sendReportEmail: mockSendReportEmail,
}));

// ---------------------------------------------------------------------------
// Mock email template service
// ---------------------------------------------------------------------------
const mockBuildReportEmailHtml = mock(
  () => "<html><body>Test Email</body></html>"
);

mock.module("../../services/email-template.service", () => ({
  buildReportEmailHtml: mockBuildReportEmailHtml,
}));

// ---------------------------------------------------------------------------
// Mock PDF export service
// ---------------------------------------------------------------------------
const mockGeneratePersonalPdf = mock(() =>
  Promise.resolve({
    pdfBuffer: Buffer.from("fake-pdf"),
    reportData: {
      total_income: 5000,
      total_expenses: 3000,
      savings_rate: 40,
      expense_to_income_ratio: 0.6,
      by_category: [],
      top_categories: [],
      month_over_month: { income_change: 0, expense_change: 0 },
    },
    aiInsights: "Great savings rate!",
  })
);

const mockGenerateHouseholdPdf = mock(() =>
  Promise.resolve({
    pdfBuffer: Buffer.from("fake-household-pdf"),
    reportData: {
      total_income: 10000,
      total_expenses: 6000,
      savings_rate: 40,
      expense_to_income_ratio: 0.6,
      by_category: [],
      top_categories: [],
      month_over_month: { income_change: 0, expense_change: 0 },
    },
    aiInsights: "Household doing well!",
  })
);

mock.module("../../services/pdf-export.service", () => ({
  generatePersonalPdfForUser: mockGeneratePersonalPdf,
  generateHouseholdPdfForHousehold: mockGenerateHouseholdPdf,
}));

// ---------------------------------------------------------------------------
// Mock unsubscribe token
// ---------------------------------------------------------------------------
const mockCreateUnsubscribeToken = mock(() => "mock-token.mock-sig");
const mockVerifyUnsubscribeToken = mock(
  (token: string) => {
    if (token === "valid-token") {
      return { valid: true, userId: TEST_USER_ID };
    }
    return { valid: false };
  }
);

mock.module("../../lib/unsubscribe-token", () => ({
  createUnsubscribeToken: mockCreateUnsubscribeToken,
  verifyUnsubscribeToken: mockVerifyUnsubscribeToken,
}));

// ---------------------------------------------------------------------------
// Mock @vercel/functions
// ---------------------------------------------------------------------------
mock.module("@vercel/functions", () => ({
  waitUntil: (promise: Promise<any>) => {
    // In tests, just let the promise run
    promise.catch(() => {});
  },
}));

// ---------------------------------------------------------------------------
// Mock AI modules (needed transitively by pdf-export.service)
// ---------------------------------------------------------------------------
mock.module("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor(_opts?: any) {}
    invoke = mock(() => Promise.resolve({ content: "mocked" }));
  },
}));

mock.module("@langchain/core/messages", () => ({
  SystemMessage: class {
    content: string;
    constructor(c: string) {
      this.content = c;
    }
  },
  HumanMessage: class {
    content: string;
    constructor(c: string) {
      this.content = c;
    }
  },
}));

// ---------------------------------------------------------------------------
// Set env vars
// ---------------------------------------------------------------------------
process.env.CRON_SECRET = CRON_SECRET;
process.env.UNSUBSCRIBE_SECRET = "test-unsubscribe-secret";
process.env.APP_URL = "https://test.spendoza.io";
process.env.API_URL = "https://api-test.spendoza.io";

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: emailsRouter } = await import("../../routes/emails");

  const app = express();
  app.use(express.json());
  app.use("/api/emails", emailsRouter);

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

function resetMocks() {
  adminCalls.length = 0;
  mockAdminFrom.mockClear();
  mockGetUserById.mockClear();
  mockSendReportEmail.mockClear();
  mockBuildReportEmailHtml.mockClear();
  mockGeneratePersonalPdf.mockClear();
  mockGenerateHouseholdPdf.mockClear();
  mockCreateUnsubscribeToken.mockClear();
  mockVerifyUnsubscribeToken.mockClear();

  mockVerifyUnsubscribeToken.mockImplementation((token: string) => {
    if (token === "valid-token") {
      return { valid: true, userId: TEST_USER_ID };
    }
    return { valid: false };
  });
}

// ===========================================================================
// Email Flow Integration Tests
// ===========================================================================
describe("Email Routes: dispatch-weekly, send, unsubscribe", () => {
  // -------------------------------------------------------------------------
  // POST /dispatch-weekly
  // -------------------------------------------------------------------------
  it("POST /dispatch-weekly returns 401 without CRON_SECRET", async () => {
    resetMocks();

    const res = await fetch(`${baseUrl}/api/emails/dispatch-weekly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("POST /dispatch-weekly returns 401 with invalid CRON_SECRET", async () => {
    resetMocks();

    const res = await fetch(`${baseUrl}/api/emails/dispatch-weekly`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-secret",
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("POST /dispatch-weekly returns 200 with valid CRON_SECRET", async () => {
    resetMocks();

    // Return empty users list (no one is eligible), which is still a 200
    adminResults = {
      profiles: {
        selectList: { data: [], error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/emails/dispatch-weekly`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("dispatched");
    expect(body.dispatched).toBe(0);
  });

  // -------------------------------------------------------------------------
  // POST /send
  // -------------------------------------------------------------------------
  it("POST /send returns 401 without CRON_SECRET", async () => {
    resetMocks();

    const res = await fetch(`${baseUrl}/api/emails/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: TEST_JOB_ID }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("POST /send returns 400 without job_id", async () => {
    resetMocks();

    const res = await fetch(`${baseUrl}/api/emails/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("job_id is required");
  });

  it("POST /send returns 200 and accepts job with valid CRON_SECRET", async () => {
    resetMocks();

    adminResults = {
      email_jobs: {
        updateResult: { data: null, error: null },
        selectSingle: {
          data: {
            id: TEST_JOB_ID,
            user_id: TEST_USER_ID,
            entity_type: "user",
            entity_id: TEST_USER_ID,
            report_month: "2026-02-01",
            status: "pending",
          },
          error: null,
        },
      },
      profiles: {
        selectSingle: {
          data: { display_name: "Test User" },
          error: null,
        },
        updateResult: { data: null, error: null },
      },
      email_report_log: {
        insertResult: { data: null, error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/emails/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({ job_id: TEST_JOB_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Job accepted");
    expect(body.job_id).toBe(TEST_JOB_ID);
  });

  // -------------------------------------------------------------------------
  // GET /unsubscribe
  // -------------------------------------------------------------------------
  it("GET /unsubscribe returns 400 with missing token", async () => {
    resetMocks();

    const res = await fetch(`${baseUrl}/api/emails/unsubscribe`);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing token");
  });

  it("GET /unsubscribe returns 400 with invalid token", async () => {
    resetMocks();

    const res = await fetch(
      `${baseUrl}/api/emails/unsubscribe?token=invalid-token`
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid");
  });

  it("GET /unsubscribe returns HTML confirmation with valid token", async () => {
    resetMocks();

    adminResults = {
      profiles: {
        updateResult: { data: null, error: null },
      },
    };

    const res = await fetch(
      `${baseUrl}/api/emails/unsubscribe?token=valid-token`
    );

    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("Unsubscribed");
    expect(html).toContain("Spendoza");
    expect(html).toContain("profile settings");

    // Verify the mock was called
    expect(mockVerifyUnsubscribeToken).toHaveBeenCalledWith("valid-token");

    // Verify profiles update was called
    const profileUpdate = adminCalls.find(
      (c) => c.table === "profiles" && c.op === "update"
    );
    expect(profileUpdate).toBeDefined();
    expect(profileUpdate!.args).toEqual({ email_reports_enabled: false });
  });
});
