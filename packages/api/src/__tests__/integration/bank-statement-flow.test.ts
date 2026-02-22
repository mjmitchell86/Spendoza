import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import type { Server } from "http";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-bs-1";
const TEST_TOKEN = "bs-access-token";
const TEST_HOUSEHOLD_ID = "hh-bs-1";

const statementRecord = {
  id: "stmt-int-1",
  user_id: TEST_USER_ID,
  file_path: `${TEST_USER_ID}/statements/january-2026.pdf`,
  file_hash: "abc123hashintegration",
  bank_name: "Chase",
  statement_month: "2026-01-01",
  is_shared_account: true,
  account_label: "Joint Checking",
  status: "uploaded",
  parsed_data: null,
  created_at: "2026-01-15T00:00:00Z",
};

const transactionRecords = [
  {
    id: "txn-int-1",
    bank_statement_id: "stmt-int-1",
    user_id: TEST_USER_ID,
    attributed_to_user_id: null,
    date: "2026-01-05",
    description: "Whole Foods Market",
    amount: 127.43,
    type: "debit",
    ai_category: "Groceries",
    created_at: "2026-01-15T00:00:00Z",
  },
  {
    id: "txn-int-2",
    bank_statement_id: "stmt-int-1",
    user_id: TEST_USER_ID,
    attributed_to_user_id: null,
    date: "2026-01-10",
    description: "Electric Company",
    amount: 89.0,
    type: "debit",
    ai_category: "Utilities",
    created_at: "2026-01-15T00:00:00Z",
  },
];

const requesterProfile = {
  id: TEST_USER_ID,
  household_id: TEST_HOUSEHOLD_ID,
  is_head: true,
};

const memberProfile = {
  id: "member-bs-2",
  household_id: TEST_HOUSEHOLD_ID,
};

// ---------------------------------------------------------------------------
// Configurable mock results keyed by table, switching per step
// ---------------------------------------------------------------------------
let fromCallCount = 0;
let currentStep = "upload";

function buildFromChain(table: string) {
  fromCallCount++;

  // ---- UPLOAD STEP ----
  if (currentStep === "upload") {
    if (table === "bank_statements") {
      // First call: duplicate check (.select("id").eq().eq().maybeSingle())
      // Second call: insert
      const isFirstBankStatementsCall = fromCallCount <= 1;
      if (isFirstBankStatementsCall) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: null, error: null }), // no duplicate
                single: () =>
                  Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          insert: (data: any) => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: statementRecord, error: null }),
            }),
          }),
        };
      }
      // Second call is the insert
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: null, error: null }),
              single: () =>
                Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
        insert: (data: any) => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: statementRecord, error: null }),
          }),
        }),
      };
    }
    return defaultTableChain(table);
  }

  // ---- LIST STEP ----
  if (currentStep === "list") {
    if (table === "bank_statements") {
      return {
        select: () => ({
          eq: () => ({
            order: () =>
              Promise.resolve({ data: [statementRecord], error: null }),
            eq: () => ({
              order: () =>
                Promise.resolve({ data: [statementRecord], error: null }),
            }),
          }),
        }),
      };
    }
    return defaultTableChain(table);
  }

  // ---- GET DETAIL STEP (statement + transactions) ----
  if (currentStep === "detail") {
    if (table === "bank_statements") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { ...statementRecord, status: "processed" },
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (table === "transactions") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({ data: transactionRecords, error: null }),
        }),
      };
    }
    return defaultTableChain(table);
  }

  // ---- ATTRIBUTE STEP ----
  if (currentStep === "attribute") {
    // Validation requires 4 lookups + 1 update:
    // 1. transactions (fetch txn)
    // 2. bank_statements (check shared)
    // 3. profiles (target user)
    // 4. profiles (requester)
    // 5. transactions (update)
    const phase = ((fromCallCount - 1) % 5) + 1;
    if (phase === 1) {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: transactionRecords[0], error: null }),
            }),
          }),
        }),
      };
    }
    if (phase === 2) {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: statementRecord, error: null }),
          }),
        }),
      };
    }
    if (phase === 3) {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: memberProfile, error: null }),
          }),
        }),
      };
    }
    if (phase === 4) {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: requesterProfile, error: null }),
          }),
        }),
      };
    }
    // phase 5: update
    return {
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  ...transactionRecords[0],
                  attributed_to_user_id: "member-bs-2",
                },
                error: null,
              }),
          }),
        }),
      }),
    };
  }

  return defaultTableChain(table);
}

function defaultTableChain(_table: string) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
        single: () => Promise.resolve({ data: null, error: null }),
        order: () => Promise.resolve({ data: [], error: null }),
        then: (r: any) => Promise.resolve({ data: [], error: null }).then(r),
      }),
      single: () => Promise.resolve({ data: null, error: null }),
    }),
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    update: () => ({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Mock functions
// ---------------------------------------------------------------------------
const mockGetUser = mock(() =>
  Promise.resolve({
    data: {
      user: {
        id: TEST_USER_ID,
        email: "bs-test@example.com",
      },
    },
    error: null,
  })
);

const mockStorageUpload = mock(() =>
  Promise.resolve({
    data: { path: `${TEST_USER_ID}/statements/january-2026.pdf` },
    error: null,
  })
);

const mockFrom = mock((table: string) => buildFromChain(table));

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    if (options?.global?.headers?.Authorization) {
      return {
        from: mockFrom,
        storage: { from: () => ({ upload: mockStorageUpload }) },
      };
    }
    return {
      auth: {
        admin: { createUser: mock() },
        signInWithPassword: mock(),
        getUser: mockGetUser,
      },
      from: mockFrom,
      storage: { from: () => ({ upload: mockStorageUpload }) },
    };
  },
}));

// ---------------------------------------------------------------------------
// Mock pdf-parse and AI modules (transitively imported by bank-statements route)
// ---------------------------------------------------------------------------
mock.module("pdf-parse", () => ({
  default: mock(() => Promise.resolve({ text: "mocked pdf text" })),
}));

mock.module("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor(_opts?: any) {}
    invoke = mock(() => Promise.resolve({ content: '{"transactions":[]}' }));
  },
}));

mock.module("@langchain/core/messages", () => ({
  SystemMessage: class {
    content: string;
    constructor(c: string) { this.content = c; }
  },
  HumanMessage: class {
    content: string;
    constructor(c: string) { this.content = c; }
  },
}));

// ---------------------------------------------------------------------------
// Mock multer to inject a fake file
// ---------------------------------------------------------------------------
const fakePdfBuffer = Buffer.from("%PDF-1.4 fake bank statement content");

mock.module("multer", () => {
  const multerInstance = () => ({
    single: (_fieldName: string) => {
      return (req: any, _res: any, next: any) => {
        req.file = {
          fieldname: "file",
          originalname: "january-2026.pdf",
          mimetype: "application/pdf",
          buffer: fakePdfBuffer,
          size: fakePdfBuffer.length,
        };
        next();
      };
    },
  });
  multerInstance.memoryStorage = () => ({});
  return { default: multerInstance };
});

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: bankStatementsRouter } = await import(
    "../../routes/bank-statements"
  );
  const { default: transactionsRouter } = await import(
    "../../routes/transactions"
  );
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/bank-statements", requireAuth, bankStatementsRouter);
  app.use("/api/transactions", requireAuth, transactionsRouter);

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
// Bank Statement Flow Integration Test
// Upload -> List -> Get detail (verify processing) -> Get transactions -> Attribute
// ===========================================================================
describe("Bank Statement Flow: Upload -> Process -> Review -> Attribute", () => {
  it("Step 1: Uploads a bank statement", async () => {
    currentStep = "upload";
    fromCallCount = 0;

    const res = await fetch(`${baseUrl}/api/bank-statements/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        statement_month: "2026-01-01",
        bank_name: "Chase",
        is_shared_account: true,
        account_label: "Joint Checking",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("stmt-int-1");
    expect(body.status).toBe("uploaded");
    expect(body.bank_name).toBe("Chase");
    expect(body.is_shared_account).toBe(true);
    expect(mockStorageUpload).toHaveBeenCalled();
  });

  it("Step 2: Lists bank statements to confirm upload", async () => {
    currentStep = "list";
    fromCallCount = 0;

    const res = await fetch(`${baseUrl}/api/bank-statements`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].id).toBe("stmt-int-1");
  });

  it("Step 3: Gets statement detail with transactions (after processing)", async () => {
    currentStep = "detail";
    fromCallCount = 0;

    const res = await fetch(`${baseUrl}/api/bank-statements/stmt-int-1`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.statement).toBeDefined();
    expect(body.statement.status).toBe("processed");
    expect(body.transactions).toBeDefined();
    expect(Array.isArray(body.transactions)).toBe(true);
    expect(body.transactions.length).toBe(2);
    expect(body.transactions[0].description).toBe("Whole Foods Market");
    expect(body.transactions[1].description).toBe("Electric Company");
  });

  it("Step 4: Lists transactions separately", async () => {
    // Reset for transaction listing
    fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "transactions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    lte: () => ({
                      order: () =>
                        Promise.resolve({ data: transactionRecords, error: null }),
                    }),
                  }),
                }),
                order: () =>
                  Promise.resolve({ data: transactionRecords, error: null }),
              }),
              order: () =>
                Promise.resolve({ data: transactionRecords, error: null }),
            }),
          }),
        };
      }
      return defaultTableChain(table);
    });

    const res = await fetch(`${baseUrl}/api/transactions`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
  });

  it("Step 5: Attributes a transaction to a household member (shared account)", async () => {
    currentStep = "attribute";
    fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => buildFromChain(table));

    const res = await fetch(`${baseUrl}/api/transactions/txn-int-1/attribute`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        attributed_to_user_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attributed_to_user_id).toBe("member-bs-2");
  });
});
