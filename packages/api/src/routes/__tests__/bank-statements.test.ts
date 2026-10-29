import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";
import { createFakeSupabase, type FakeSupabase } from "../../__tests__/helpers/fake-supabase";

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

const defaultStorageFrom = (_bucket?: string): any => ({
  upload: mockStorageUpload,
});
const mockStorageFrom = mock(defaultStorageFrom);

const defaultFrom = (_table: string): any => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
});
const mockFrom = mock(defaultFrom);

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
// Change `currentMockFile` between tests to simulate different file types.
// ---------------------------------------------------------------------------
const fakePdfBuffer = Buffer.from("%PDF-1.4 fake content for testing");
const fakeCsvBuffer = Buffer.from("Date,Description,Amount\n2026-01-05,Grocery store,52.43");

let currentMockFile: {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
} = {
  fieldname: "file",
  originalname: "test-statement.pdf",
  mimetype: "application/pdf",
  buffer: fakePdfBuffer,
  size: fakePdfBuffer.length,
};

mock.module("multer", () => {
  const multerInstance = () => ({
    single: (_fieldName: string) => {
      return (req: any, _res: any, next: any) => {
        req.file = { ...currentMockFile };
        next();
      };
    },
  });
  multerInstance.memoryStorage = () => ({});
  return { default: multerInstance };
});

// ---------------------------------------------------------------------------
// Mock @vercel/functions (waitUntil is used for background processing)
// ---------------------------------------------------------------------------
mock.module("@vercel/functions", () => ({
  waitUntil: (_promise: Promise<any>) => {},
}));

// ---------------------------------------------------------------------------
// Mock AI pipeline to avoid loading pdf-parse in tests.
// ---------------------------------------------------------------------------
mock.module("../../services/ai-pipeline.service", () => ({
  processBankStatement: mock(() => Promise.resolve()),
}));

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
  // Reset mock file to PDF default
  currentMockFile = {
    fieldname: "file",
    originalname: "test-statement.pdf",
    mimetype: "application/pdf",
    buffer: fakePdfBuffer,
    size: fakePdfBuffer.length,
  };

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
  mockFrom.mockImplementation(defaultFrom);
  mockStorageFrom.mockImplementation(defaultStorageFrom);

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
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Duplicate statement");
  });

  it("returns 201 without statement_month", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("stmt-1");
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
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

// ===========================================================================
// CSV upload tests
// ===========================================================================
describe("POST /api/bank-statements/upload (CSV)", () => {
  const url = () => `${baseUrl}/api/bank-statements/upload`;

  it("returns 201 for CSV file upload", async () => {
    currentMockFile = {
      fieldname: "file",
      originalname: "test-statement.csv",
      mimetype: "text/csv",
      buffer: fakeCsvBuffer,
      size: fakeCsvBuffer.length,
    };

    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        bank_name: "Chase",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("stmt-1");
  });

  it("accepts text/plain mimetype with .csv extension", async () => {
    currentMockFile = {
      fieldname: "file",
      originalname: "test-statement.csv",
      mimetype: "text/plain",
      buffer: fakeCsvBuffer,
      size: fakeCsvBuffer.length,
    };

    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
  });

  it("rejects unsupported file types with 400", async () => {
    currentMockFile = {
      fieldname: "file",
      originalname: "test-statement.xlsx",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("fake xlsx"),
      size: 9,
    };

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
    expect(body.error).toBe("Only PDF and CSV files are supported");
  });
});

// ===========================================================================
// Statement file cleanup (in-memory Supabase fake for tables + storage)
// ===========================================================================
const PDF_PATH = `${TEST_USER_ID}/statements/test-statement.pdf`;
const CSV_PATH = `${TEST_USER_ID}/statements/history.csv`;

let fake: FakeSupabase;

function useFake(rows: Record<string, any>[], files: string[]) {
  fake = createFakeSupabase({ bank_statements: rows }, files);
  mockFrom.mockImplementation((table: string) => fake.from(table));
  mockStorageFrom.mockImplementation((bucket?: string) => fake.storage.from(bucket ?? ""));
}

const failedSingle = {
  ...statementRecord,
  id: "stmt-failed",
  status: "failed",
  parsed_data: { error: "boom" },
};

// A multi-month CSV: the parent is split into children that share its file.
const splitParent = {
  ...statementRecord,
  id: "stmt-parent",
  file_path: CSV_PATH,
  file_hash: "csvhash",
  status: "parsed",
  parsed_data: { is_parent_split: true },
};
const splitChild = (id: string, month: string, status: string) => ({
  ...statementRecord,
  id,
  file_path: CSV_PATH,
  file_hash: `csvhash:${month}`,
  status,
  parsed_data: { source_statement_id: "stmt-parent" },
});

const ids = () => fake.tables.bank_statements.map((r) => r.id).sort();

describe("DELETE /api/bank-statements/:id (file cleanup)", () => {
  const del = (id: string) =>
    fetch(`${baseUrl}/api/bank-statements/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

  it("deletes the failed statement's file from storage", async () => {
    useFake([failedSingle], [PDF_PATH]);

    const res = await del("stmt-failed");

    expect(res.status).toBe(204);
    expect(ids()).toEqual([]);
    expect(fake.removedFiles).toEqual([PDF_PATH]);
    expect(fake.files.has(PDF_PATH)).toBe(false);
  });

  it("deletes a failed parent's file along with its split children", async () => {
    useFake(
      [
        { ...splitParent, status: "failed" },
        splitChild("stmt-jan", "2026-01", "processing"),
      ],
      [CSV_PATH]
    );

    const res = await del("stmt-parent");

    expect(res.status).toBe(204);
    expect(ids()).toEqual([]);
    expect(fake.files.has(CSV_PATH)).toBe(false);
  });

  it("deletes the shared file when removing the only failed child of a split", async () => {
    useFake(
      [
        splitParent,
        splitChild("stmt-jan", "2026-01", "parsed"),
        splitChild("stmt-feb", "2026-02", "failed"),
      ],
      [CSV_PATH]
    );

    const res = await del("stmt-feb");

    expect(res.status).toBe(204);
    expect(ids()).toEqual(["stmt-jan", "stmt-parent"]);
    expect(fake.removedFiles).toEqual([CSV_PATH]);
    expect(fake.files.has(CSV_PATH)).toBe(false);
  });

  it("keeps the shared file while another child of the split has failed", async () => {
    useFake(
      [
        splitParent,
        splitChild("stmt-jan", "2026-01", "failed"),
        splitChild("stmt-feb", "2026-02", "failed"),
      ],
      [CSV_PATH]
    );

    const res = await del("stmt-feb");

    expect(res.status).toBe(204);
    expect(ids()).toEqual(["stmt-jan", "stmt-parent"]);
    expect(fake.removedFiles).toEqual([]);
    expect(fake.files.has(CSV_PATH)).toBe(true);

    // Removing the last failed child then deletes the file
    const res2 = await del("stmt-jan");
    expect(res2.status).toBe(204);
    expect(fake.files.has(CSV_PATH)).toBe(false);
  });

  it("deletes the shared file if the last processing sibling finishes during removal", async () => {
    useFake(
      [
        splitParent,
        splitChild("stmt-jan", "2026-01", "processing"),
        splitChild("stmt-feb", "2026-02", "failed"),
      ],
      [CSV_PATH]
    );
    // The sibling finishes (and sees stmt-feb still present) right as rows are deleted
    mockFrom.mockImplementation((table: string) => {
      const query = fake.from(table);
      const realDelete = query.delete.bind(query);
      query.delete = () => {
        fake.tables.bank_statements.find((r) => r.id === "stmt-jan")!.status = "parsed";
        return realDelete();
      };
      return query;
    });

    const res = await del("stmt-feb");

    expect(res.status).toBe(204);
    expect(ids()).toEqual(["stmt-jan", "stmt-parent"]);
    expect(fake.files.has(CSV_PATH)).toBe(false);
  });

  it("never deletes a file outside the user's own statements folder", async () => {
    const otherPath = "other-user/statements/test-statement.pdf";
    useFake([{ ...failedSingle, file_path: otherPath }], [otherPath]);

    const res = await del("stmt-failed");

    expect(res.status).toBe(204);
    expect(ids()).toEqual([]);
    expect(fake.storageLog).toEqual([]);
    expect(fake.files.has(otherPath)).toBe(true);
  });

  it("never deletes a file reached by path traversal", async () => {
    const otherPath = "other-user/statements/test-statement.pdf";
    useFake(
      [{ ...failedSingle, file_path: `${TEST_USER_ID}/statements/../../${otherPath}` }],
      [otherPath]
    );

    const res = await del("stmt-failed");

    expect(res.status).toBe(204);
    expect(fake.storageLog).toEqual([]);
    expect(fake.files.has(otherPath)).toBe(true);
  });

  it("returns 500 and keeps the statement if the file cannot be deleted", async () => {
    useFake([failedSingle], [PDF_PATH]);
    fake.setRemoveError("storage unavailable");

    const res = await del("stmt-failed");

    expect(res.status).toBe(500);
    expect(ids()).toEqual(["stmt-failed"]);
  });

  it("does not touch storage for a statement that is not failed", async () => {
    useFake([{ ...failedSingle, status: "parsed" }], [PDF_PATH]);

    const res = await del("stmt-failed");

    expect(res.status).toBe(400);
    expect(fake.storageLog).toEqual([]);
    expect(ids()).toEqual(["stmt-failed"]);
  });
});

describe("POST /api/bank-statements/upload (file cleanup)", () => {
  const upload = () =>
    fetch(`${baseUrl}/api/bank-statements/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ bank_name: "Chase" }),
    });

  it("rejects a file name that would escape the user's statements folder", async () => {
    useFake([], []);
    currentMockFile = { ...currentMockFile, originalname: "../../other-user/statements/x.pdf" };

    const res = await upload();

    expect(res.status).toBe(400);
    expect(fake.storageLog).toEqual([]);
    expect(fake.tables.bank_statements).toHaveLength(0);
  });

  it("removes the uploaded file if the statement row cannot be inserted", async () => {
    useFake([], []);
    fake.failNextInsert("bank_statements", "insert failed");

    const res = await upload();

    expect(res.status).toBe(400);
    expect(fake.storageLog).toEqual([`upload:${PDF_PATH}`, `remove:${PDF_PATH}`]);
    expect(fake.files.has(PDF_PATH)).toBe(false);
  });

  it("does not remove an existing file when the storage upload itself fails", async () => {
    // Another statement's file already occupies the path, so upload fails
    useFake([], [PDF_PATH]);

    const res = await upload();

    expect(res.status).toBe(500);
    expect(fake.removedFiles).toEqual([]);
    expect(fake.files.has(PDF_PATH)).toBe(true);
  });

  it("re-uploading over a failed statement replaces its file and row", async () => {
    const { computeFileHash } = await import("../../services/bank-statement.service");
    useFake([{ ...failedSingle, file_hash: computeFileHash(fakePdfBuffer) }], [PDF_PATH]);

    const res = await upload();

    expect(res.status).toBe(201);
    // Old file removed before the new one is uploaded to the same path
    expect(fake.storageLog).toEqual([`remove:${PDF_PATH}`, `upload:${PDF_PATH}`]);
    expect(fake.files.has(PDF_PATH)).toBe(true);
    const rows = fake.tables.bank_statements;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe("stmt-failed");
    expect(rows[0].status).toBe("processing");
  });

  it("re-uploading over a failed statement under a new filename removes the old file", async () => {
    const { computeFileHash } = await import("../../services/bank-statement.service");
    const oldPath = `${TEST_USER_ID}/statements/old-name.pdf`;
    useFake([{ ...failedSingle, file_path: oldPath, file_hash: computeFileHash(fakePdfBuffer) }], [oldPath]);

    const res = await upload();

    expect(res.status).toBe(201);
    expect(fake.files.has(oldPath)).toBe(false);
    expect(fake.files.has(PDF_PATH)).toBe(true);
  });
});

describe("POST /api/bank-statements/:id/reprocess (restart step)", () => {
  const reprocess = (id: string) =>
    fetch(`${baseUrl}/api/bank-statements/${id}/reprocess`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

  // Failure discards intermediate text, so every Retry restarts from the kept file.
  for (const fileType of ["pdf", "csv"]) {
    it(`restarts a failed ${fileType.toUpperCase()} statement from extract_text`, async () => {
      useFake([{ ...failedSingle, file_type: fileType }], [PDF_PATH]);

      const res = await reprocess("stmt-failed");

      expect(res.status).toBe(200);
      const row = fake.tables.bank_statements[0];
      expect(row.status).toBe("processing");
      expect(row.parsed_data).toEqual({ pipeline_step: "extract_text" });
    });
  }

  it("returns 404 for another user's statement", async () => {
    useFake([{ ...failedSingle, user_id: "other-user" }], []);

    const res = await reprocess("stmt-failed");

    expect(res.status).toBe(404);
    expect(fake.tables.bank_statements[0].status).toBe("failed");
  });
});
