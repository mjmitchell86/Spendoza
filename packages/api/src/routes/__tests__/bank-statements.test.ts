import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_TOKEN = "valid-access-token";

const statementRecord = {
  id: "stmt-1",
  user_id: TEST_USER_ID,
  file_path: `${TEST_USER_ID}/statements/test-statement.pdf`,
  file_hash: "abc123hash",
  bank_name: "Chase",
  statement_month: "2026-01-01",
  is_shared_account: false,
  account_label: null,
  status: "uploaded",
  parsed_data: null,
  created_at: "2026-01-15T00:00:00Z",
};

const statementsList = [
  statementRecord,
  {
    ...statementRecord,
    id: "stmt-2",
    bank_name: "Wells Fargo",
    statement_month: "2026-02-01",
    created_at: "2026-02-15T00:00:00Z",
  },
];

const transactionsList = [
  {
    id: "txn-1",
    bank_statement_id: "stmt-1",
    description: "Grocery store",
    amount: 52.43,
    date: "2026-01-05",
  },
  {
    id: "txn-2",
    bank_statement_id: "stmt-1",
    description: "Gas station",
    amount: 35.0,
    date: "2026-01-10",
  },
];

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------
// Bank statements routes use these chains:
// GET list:     .from("bank_statements").select("*").eq("user_id", ...).order("created_at", { ascending: false })
// GET single:   .from("bank_statements").select("*").eq("id", ...).eq("user_id", ...).single()
// GET txns:     .from("transactions").select("*").eq("bank_statement_id", ...)
// POST upload dup check: .from("bank_statements").select("id").eq("user_id", ...).eq("file_hash", ...).maybeSingle()
// POST upload insert:    .from("bank_statements").insert({...}).select().single()
// POST reprocess update: .from("bank_statements").update({...}).eq("id", ...).eq("user_id", ...).select().single()
// ---------------------------------------------------------------------------

// GET list terminal: .order("created_at", { ascending: false })
const mockOrder = mock(() =>
  Promise.resolve({ data: statementsList, error: null })
);

// GET single / dup check / transactions
const mockSingle = mock(() =>
  Promise.resolve({ data: statementRecord, error: null })
);

const mockMaybeSingle = mock(() =>
  Promise.resolve({ data: null, error: null })
);

// Chainable .eq() for list query: .eq("user_id", ...).order(...)
const mockListEqChain: Record<string, any> = {};
mockListEqChain.eq = mock(() => mockListEqChain);
mockListEqChain.order = mockOrder;
mockListEqChain.single = mockSingle;
mockListEqChain.maybeSingle = mockMaybeSingle;

// POST insert terminal: .insert({...}).select().single()
const mockInsertSingle = mock(() =>
  Promise.resolve({ data: statementRecord, error: null })
);
const mockInsert = mock(() => ({
  select: () => ({ single: mockInsertSingle }),
}));

// POST reprocess update terminal: .update({...}).eq("id", ...).eq("user_id", ...).select().single()
const mockUpdateSingle = mock(() =>
  Promise.resolve({ data: { ...statementRecord, status: "uploaded" }, error: null })
);
const mockUpdate = mock(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
}));

// SELECT chain
const mockSelect = mock((_cols?: string) => ({
  eq: () => mockListEqChain,
}));

// Storage mock
const mockStorageUpload = mock(() =>
  Promise.resolve({
    data: { path: `${TEST_USER_ID}/statements/test-statement.pdf` },
    error: null,
  })
);

const mockStorageFrom = mock(() => ({
  upload: mockStorageUpload,
}));

const mockFrom = mock((_table: string) => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
}));

// ---------------------------------------------------------------------------
// Mock for supabaseAdmin (auth middleware uses getUser, upload uses storage)
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

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js BEFORE any import that depends on it.
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    if (options?.global?.headers?.Authorization) {
      return {
        from: mockFrom,
        storage: { from: mockStorageFrom },
      };
    }
    return {
      auth: {
        admin: { createUser: mock() },
        signInWithPassword: mock(),
        getUser: mockGetUser,
      },
      from: mockFrom,
      storage: { from: mockStorageFrom },
    };
  },
}));

// ---------------------------------------------------------------------------
// Mock multer to avoid actual file system operations in tests.
// We simulate multer by injecting req.file via a tiny middleware.
// ---------------------------------------------------------------------------
const fakePdfBuffer = Buffer.from("%PDF-1.4 fake content for testing");

mock.module("multer", () => {
  const multerInstance = () => ({
    single: (_fieldName: string) => {
      return (req: any, _res: any, next: any) => {
        req.file = {
          fieldname: "file",
          originalname: "test-statement.pdf",
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
// Test helpers
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: bankStatementsRouter } = (await import(
    "../bank-statements"
  )) as { default: Router };
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/bank-statements", requireAuth, bankStatementsRouter);

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
  mockOrder.mockClear();
  mockSingle.mockClear();
  mockMaybeSingle.mockClear();
  mockListEqChain.eq.mockClear();
  mockInsertSingle.mockClear();
  mockInsert.mockClear();
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
  mockSelect.mockClear();
  mockFrom.mockClear();
  mockGetUser.mockClear();
  mockStorageUpload.mockClear();
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

  mockOrder.mockImplementation(() =>
    Promise.resolve({ data: statementsList, error: null })
  );

  mockSingle.mockImplementation(() =>
    Promise.resolve({ data: statementRecord, error: null })
  );

  // Default: no duplicate found
  mockMaybeSingle.mockImplementation(() =>
    Promise.resolve({ data: null, error: null })
  );

  mockInsertSingle.mockImplementation(() =>
    Promise.resolve({ data: statementRecord, error: null })
  );

  mockUpdateSingle.mockImplementation(() =>
    Promise.resolve({ data: { ...statementRecord, status: "uploaded" }, error: null })
  );

  mockStorageUpload.mockImplementation(() =>
    Promise.resolve({
      data: { path: `${TEST_USER_ID}/statements/test-statement.pdf` },
      error: null,
    })
  );
});

// ===========================================================================
// computeFileHash unit test
// ===========================================================================
describe("computeFileHash", () => {
  it("returns correct SHA-256 hash for a buffer", async () => {
    const { computeFileHash } = await import(
      "../../services/bank-statement.service"
    );
    const buffer = Buffer.from("hello world");
    const hash = computeFileHash(buffer);
    // SHA-256 of "hello world"
    expect(hash).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
  });
});

// ===========================================================================
// POST /api/bank-statements/upload
// ===========================================================================
describe("POST /api/bank-statements/upload", () => {
  const url = () => `${baseUrl}/api/bank-statements/upload`;

  it("returns 201 with created statement", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        statement_month: "2026-01-01",
        bank_name: "Chase",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("stmt-1");
    expect(body.status).toBe("uploaded");
    expect(body.user_id).toBe(TEST_USER_ID);

    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("bank_statements");
    expect(mockStorageFrom).toHaveBeenCalledWith("bank-statements");
  });

  it("returns 409 for duplicate file hash", async () => {
    // Simulate duplicate found
    mockMaybeSingle.mockImplementation(() =>
      Promise.resolve({ data: { id: "stmt-existing" }, error: null })
    );

    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        statement_month: "2026-01-01",
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Duplicate statement");
  });

  it("returns 400 when statement_month is missing", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement_month: "2026-01-01" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization header");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/bank-statements
// ===========================================================================
describe("GET /api/bank-statements", () => {
  const url = () => `${baseUrl}/api/bank-statements`;

  it("returns 200 with statements list", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].bank_name).toBe("Chase");
    expect(body[1].bank_name).toBe("Wells Fargo");

    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("bank_statements");
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization header");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/bank-statements/:id
// ===========================================================================
describe("GET /api/bank-statements/:id", () => {
  const url = (id: string) => `${baseUrl}/api/bank-statements/${id}`;

  it("returns 200 with statement and transactions", async () => {
    // Mock: first call for statement, second for transactions
    let callCount = 0;
    mockFrom.mockImplementation((_table: string) => {
      callCount++;
      if (callCount === 1) {
        // bank_statements table
        return {
          select: () => ({
            eq: () => ({
              eq: () => mockListEqChain,
              order: mockOrder,
              single: mockSingle,
              maybeSingle: mockMaybeSingle,
            }),
          }),
          insert: mockInsert,
          update: mockUpdate,
        };
      }
      // transactions table
      return {
        select: () => ({
          eq: mock(() =>
            Promise.resolve({ data: transactionsList, error: null })
          ),
        }),
        insert: mockInsert,
        update: mockUpdate,
      };
    });

    mockSingle.mockImplementation(() =>
      Promise.resolve({ data: statementRecord, error: null })
    );

    const res = await fetch(url("stmt-1"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.statement).toBeDefined();
    expect(body.statement.id).toBe("stmt-1");
    expect(body.transactions).toBeDefined();
    expect(Array.isArray(body.transactions)).toBe(true);
  });

  it("returns 404 for non-existent statement", async () => {
    mockFrom.mockImplementation((_table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            ...mockListEqChain,
            single: () =>
              Promise.resolve({
                data: null,
                error: { message: "Not found", code: "PGRST116" },
              }),
          }),
        }),
      }),
      insert: mockInsert,
      update: mockUpdate,
    }));

    const res = await fetch(url("stmt-nonexistent"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Statement not found");
  });
});

// ===========================================================================
// POST /api/bank-statements/:id/reprocess
// ===========================================================================
describe("POST /api/bank-statements/:id/reprocess", () => {
  const url = (id: string) => `${baseUrl}/api/bank-statements/${id}/reprocess`;

  it("returns 200 with reprocessing message", async () => {
    const res = await fetch(url("stmt-1"), {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Reprocessing started");
    expect(mockFrom).toHaveBeenCalledWith("bank_statements");
  });

  it("returns 404 for non-existent statement", async () => {
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({
        data: null,
        error: { message: "Not found", code: "PGRST116" },
      })
    );

    const res = await fetch(url("stmt-nonexistent"), {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Statement not found");
  });
});
