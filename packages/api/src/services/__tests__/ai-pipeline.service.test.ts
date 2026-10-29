import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createFakeSupabase, type FakeSupabase } from "../../__tests__/helpers/fake-supabase";

// ---------------------------------------------------------------------------
// Raw statement file cleanup in the AI pipeline.
// The file must be deleted once processing finishes, but a multi-month CSV's
// child statements share the parent's file, so it may only be deleted once no
// statement using it is still processing or failed (failed keeps it for Retry).
// ---------------------------------------------------------------------------

const USER_ID = "user-pipe-1";
const FILE_PATH = `${USER_ID}/statements/history.csv`;
const PARENT_HASH = "parenthash";

let fake: FakeSupabase;

mock.module("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => fake.from(table),
    storage: { from: (bucket: string) => fake.storage.from(bucket) },
  }),
}));

const mockExtractTransactions = mock(() =>
  Promise.resolve({ transactions: [] as any[], detectedBankName: null, accountLast4: null })
);

mock.module("../../ai/pdf-parser", () => ({
  extractTextFromPDF: mock(() => Promise.resolve("pdf text")),
  extractTransactions: mockExtractTransactions,
}));
mock.module("../../ai/transaction-classifier", () => ({
  classifyTransactions: mock((txns: any[]) => Promise.resolve(txns)),
}));
mock.module("../../ai/expense-matcher", () => ({
  matchTransactions: mock((txns: any[]) =>
    Promise.resolve(txns.map((t) => ({ ...t, matched_expense_id: null, matched_income_id: null })))
  ),
}));
mock.module("../bill-detection.service", () => ({
  detectRecurringBills: mock(() => Promise.resolve()),
}));
mock.module("../income-detection.service", () => ({
  detectRecurringIncome: mock(() => Promise.resolve()),
}));
mock.module("../debt-payment-linker.service", () => ({
  linkPaymentsToDebts: mock(() => Promise.resolve(0)),
}));
mock.module("../report.service", () => ({
  generateUserReport: mock(() => Promise.resolve()),
  generateHouseholdReport: mock(() => Promise.resolve()),
}));

const { executeStep } = await import("../ai-pipeline.service");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const classified = [
  { date: "2026-02-03", description: "Coffee", amount: 4.5, type: "debit", ai_category: "Dining" },
];

function statement(overrides: Record<string, any>) {
  return {
    user_id: USER_ID,
    file_path: FILE_PATH,
    file_type: "csv",
    bank_name: "Chase",
    statement_month: null,
    is_shared_account: false,
    account_label: null,
    ...overrides,
  };
}

const parentSplit = statement({
  id: "parent",
  file_hash: PARENT_HASH,
  status: "parsed",
  parsed_data: { is_parent_split: true, split_months: ["2026-01", "2026-02"], child_count: 2 },
});

function child(id: string, month: string, status: string, parsed_data: Record<string, any> = {}) {
  return statement({
    id,
    file_hash: `${PARENT_HASH}:${month}`,
    status,
    parsed_data: { source_statement_id: "parent", ...parsed_data },
  });
}

function setup(rows: Record<string, any>[]) {
  fake = createFakeSupabase(
    { bank_statements: rows, transactions: [], expenses: [], income_entries: [], categories: [], profiles: [] },
    [FILE_PATH]
  );
}

const statusOf = (id: string) => fake.tables.bank_statements.find((r) => r.id === id)?.status;

beforeEach(() => {
  mockExtractTransactions.mockClear();
  mockExtractTransactions.mockImplementation(() =>
    Promise.resolve({ transactions: [], detectedBankName: null, accountLast4: null })
  );
});

// ===========================================================================
// Single (non-split) statements
// ===========================================================================
describe("raw file cleanup: single statements", () => {
  it("deletes the file when match_and_insert completes", async () => {
    setup([
      statement({
        id: "single",
        file_hash: "singlehash",
        status: "processing",
        parsed_data: { pipeline_step: "match_and_insert", classified_transactions: classified },
      }),
    ]);

    await executeStep("single", "match_and_insert");

    expect(statusOf("single")).toBe("parsed");
    expect(fake.removedFiles).toEqual([FILE_PATH]);
    expect(fake.files.has(FILE_PATH)).toBe(false);
  });

  it("deletes the file when no transactions are found", async () => {
    setup([
      statement({
        id: "single",
        file_hash: "singlehash",
        status: "processing",
        parsed_data: { pipeline_step: "extract_transactions", pdf_text: "Date,Amount" },
      }),
    ]);

    await executeStep("single", "extract_transactions");

    expect(statusOf("single")).toBe("parsed");
    expect(fake.files.has(FILE_PATH)).toBe(false);
  });

  it("keeps the file when processing fails for good (so Retry can use it)", async () => {
    setup([
      statement({
        id: "single",
        file_hash: "singlehash",
        status: "processing",
        parsed_data: { pipeline_step: "match_and_insert", retry_count: 2 }, // no classified_transactions -> throws
      }),
    ]);

    // Skip the retry backoff delay
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => {
      fn();
      return 0;
    }) as any;
    try {
      await executeStep("single", "match_and_insert");
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }

    expect(statusOf("single")).toBe("failed");
    expect(fake.removedFiles).toEqual([]);
    expect(fake.files.has(FILE_PATH)).toBe(true);
  });
});

// ===========================================================================
// Multi-month CSV splits (children share the parent's file)
// ===========================================================================
describe("raw file cleanup: multi-month CSV split", () => {
  it("parent split keeps the file while its children are processing", async () => {
    setup([
      statement({
        id: "parent",
        file_hash: PARENT_HASH,
        status: "processing",
        parsed_data: { pipeline_step: "extract_text" },
      }),
    ]);
    fake.fileContents[FILE_PATH] =
      "Date,Description,Amount\n2026-01-05,Coffee,4.50\n2026-01-20,Lunch,12.00\n2026-02-03,Gas,40.00\n2026-02-14,Dinner,55.00";

    await executeStep("parent", "extract_text");

    expect(statusOf("parent")).toBe("parsed");
    const children = fake.tables.bank_statements.filter((r) => r.file_hash.startsWith(`${PARENT_HASH}:`));
    expect(children).toHaveLength(2);
    expect(fake.removedFiles).toEqual([]);
    expect(fake.files.has(FILE_PATH)).toBe(true);
  });

  it("a child with zero transactions does not delete the file while a sibling is still processing", async () => {
    setup([
      parentSplit,
      child("jan", "2026-01", "processing", { pipeline_step: "extract_transactions", pdf_text: "Date,Amount" }),
      child("feb", "2026-02", "processing", { pipeline_step: "classify_transactions" }),
    ]);

    await executeStep("jan", "extract_transactions");

    expect(statusOf("jan")).toBe("parsed");
    expect(fake.removedFiles).toEqual([]);
    expect(fake.files.has(FILE_PATH)).toBe(true);
  });

  it("a child finishing match_and_insert does not delete the file while a sibling is still processing", async () => {
    setup([
      parentSplit,
      child("jan", "2026-01", "processing", { pipeline_step: "extract_transactions" }),
      child("feb", "2026-02", "processing", { pipeline_step: "match_and_insert", classified_transactions: classified }),
    ]);

    await executeStep("feb", "match_and_insert");

    expect(statusOf("feb")).toBe("parsed");
    expect(fake.files.has(FILE_PATH)).toBe(true);
  });

  it("the last child to finish successfully deletes the shared file", async () => {
    setup([
      parentSplit,
      child("jan", "2026-01", "parsed"),
      child("feb", "2026-02", "processing", { pipeline_step: "match_and_insert", classified_transactions: classified }),
    ]);

    await executeStep("feb", "match_and_insert");

    expect(statusOf("feb")).toBe("parsed");
    expect(fake.removedFiles).toEqual([FILE_PATH]);
    expect(fake.files.has(FILE_PATH)).toBe(false);
  });

  it("the last child finding zero transactions deletes the shared file", async () => {
    setup([
      parentSplit,
      child("jan", "2026-01", "parsed"),
      child("feb", "2026-02", "processing", { pipeline_step: "extract_transactions", pdf_text: "Date,Amount" }),
    ]);

    await executeStep("feb", "extract_transactions");

    expect(fake.files.has(FILE_PATH)).toBe(false);
  });

  it("keeps the shared file when a sibling child failed", async () => {
    setup([
      parentSplit,
      child("jan", "2026-01", "failed"),
      child("feb", "2026-02", "processing", { pipeline_step: "match_and_insert", classified_transactions: classified }),
    ]);

    await executeStep("feb", "match_and_insert");

    expect(statusOf("feb")).toBe("parsed");
    expect(fake.removedFiles).toEqual([]);
    expect(fake.files.has(FILE_PATH)).toBe(true);
  });
});

// ===========================================================================
// Statement file paths are confined to the owner's folder
// ===========================================================================
describe("statement file path confinement", () => {
  it("refuses to download a file outside the owner's statements folder", async () => {
    const otherPath = "other-user/statements/history.csv";
    setup([
      statement({
        id: "single",
        file_hash: "singlehash",
        file_path: otherPath,
        status: "processing",
        parsed_data: { pipeline_step: "extract_text" },
      }),
    ]);
    fake.files.add(otherPath);

    await executeStep("single", "extract_text");

    expect(fake.storageLog).toEqual([]);
    const row = fake.tables.bank_statements.find((r) => r.id === "single")!;
    expect(row.parsed_data.pdf_text).toBeUndefined();
    expect(row.status).not.toBe("parsed");
  });

  it("refuses to delete a file outside the owner's statements folder", async () => {
    const otherPath = "other-user/statements/history.csv";
    setup([
      statement({
        id: "single",
        file_hash: "singlehash",
        file_path: otherPath,
        status: "processing",
        parsed_data: { pipeline_step: "match_and_insert", classified_transactions: classified },
      }),
    ]);
    fake.files.add(otherPath);

    await executeStep("single", "match_and_insert");

    expect(fake.storageLog).toEqual([]);
    expect(fake.files.has(otherPath)).toBe(true);
  });
});
