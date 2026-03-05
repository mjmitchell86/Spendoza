import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  mock,
  beforeEach,
} from "bun:test";
import type { Server } from "http";

const TEST_USER_ID = "user-email-1";
const TEST_EMAIL = "email-test@example.com";
const CRON_SECRET = "test-cron-secret-email";

let adminResults: Record<string, any> = {};
const adminCalls: Array<{ table: string; op: string; args?: any }> = [];

function buildChain(
  results: Record<string, any>,
  calls: typeof adminCalls
) {
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
              Promise.resolve(
                cfg.insertSingle ?? { data: null, error: null }
              ),
          }),
          then: (resolve: any) =>
            Promise.resolve(
              cfg.insertResult ?? { data: null, error: null }
            ).then(resolve),
        };
      },
      update: (data: any) => {
        calls.push({ table, op: "update", args: data });
        return makeEqChain();
      },
      upsert: (data: any) => {
        calls.push({ table, op: "upsert", args: data });
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                cfg.upsertSingle ?? { data: null, error: null }
              ),
          }),
        };
      },
    };
  };
}

// Mock supabase
mock.module("../../lib/supabase", () => ({
  supabaseAdmin: {
    from: (...args: any[]) => buildChain(adminResults, adminCalls)(...args),
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: TEST_USER_ID, email: TEST_EMAIL } },
          error: null,
        }),
      admin: {
        getUserById: () =>
          Promise.resolve({
            data: { user: { email: TEST_EMAIL } },
            error: null,
          }),
      },
    },
  },
  createSupabaseClient: () => ({
    from: (...args: any[]) => buildChain(adminResults, adminCalls)(...args),
  }),
}));

// Mock email service
const mockSendEmail = mock(() =>
  Promise.resolve({ success: true, emailId: "email-abc" })
);
mock.module("../../services/email.service", () => ({
  sendReportEmail: mockSendEmail,
}));

// Mock PDF export
mock.module("../../services/pdf-export.service", () => ({
  generatePersonalPdfForUser: mock(() =>
    Promise.resolve({
      pdfBuffer: Buffer.from("fake-pdf"),
      reportData: {
        total_income: 5000,
        total_expenses: 2000,
        savings_rate: 60,
        expense_to_income_ratio: 0.4,
        by_category: [],
        top_categories: [],
        month_over_month: null,
      },
      aiInsights: "Test insights bullet 1.\nTest insights bullet 2.",
    })
  ),
  generateHouseholdPdfForHousehold: mock(() => Promise.resolve(null)),
  generatePersonalPdfForRange: mock(() => Promise.resolve(null)),
  generateHouseholdPdfForRange: mock(() => Promise.resolve(null)),
}));

// Mock unsubscribe token
mock.module("../../lib/unsubscribe-token", () => ({
  createUnsubscribeToken: mock(() => "mock-token"),
  verifyUnsubscribeToken: mock((token: string) => {
    if (token === "valid-token")
      return { valid: true, userId: TEST_USER_ID };
    return { valid: false };
  }),
}));

// Mock email template
mock.module("../../services/email-template.service", () => ({
  buildReportEmailHtml: mock(() => "<html>mock email</html>"),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.RESEND_API_KEY = "re_test_123";
  process.env.UNSUBSCRIBE_SECRET =
    "test-unsub-secret-at-least-32-chars!!!";
  process.env.APP_URL = "https://spendoza.io";
  process.env.API_URL = "https://api.spendoza.io";

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

describe("POST /api/emails/dispatch-weekly", () => {
  beforeEach(() => {
    adminCalls.length = 0;
    adminResults = {};
  });

  it("returns 401 without CRON_SECRET", async () => {
    const res = await fetch(
      `${baseUrl}/api/emails/dispatch-weekly`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid CRON_SECRET", async () => {
    adminResults = {
      profiles: {
        selectList: { data: [], error: null },
      },
    };

    const res = await fetch(
      `${baseUrl}/api/emails/dispatch-weekly`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      }
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/emails/unsubscribe", () => {
  beforeEach(() => {
    adminCalls.length = 0;
    adminResults = {
      profiles: {
        selectSingle: { data: { id: TEST_USER_ID }, error: null },
      },
    };
  });

  it("returns HTML confirmation for valid token", async () => {
    const res = await fetch(
      `${baseUrl}/api/emails/unsubscribe?token=valid-token`
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Unsubscribed");
  });

  it("returns 400 for invalid token", async () => {
    const res = await fetch(
      `${baseUrl}/api/emails/unsubscribe?token=bad-token`
    );
    expect(res.status).toBe(400);
  });
});
