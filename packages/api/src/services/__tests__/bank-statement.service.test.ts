import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ServiceContext } from "../context";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_EMAIL = "test@example.com";

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

// listBankStatements: .from("bank_statements").select("*").eq("user_id",...).order("created_at",...)
const mockOrder = mock(() => Promise.resolve({ data: statementsList, error: null }));

// getBankStatement statement query: .from("bank_statements").select("*").eq("id",...).eq("user_id",...).single()
const mockSingle = mock(() => Promise.resolve({ data: statementRecord, error: null }));

// getBankStatement transactions query: .from("transactions").select("*").eq("bank_statement_id",...)
const mockTxnEq = mock(() => Promise.resolve({ data: transactionsList, error: null }));
const mockTxnSelect = mock((_cols?: string) => ({ eq: mockTxnEq }));

// Chainable .eq() for list query: returns chain with .eq() and .order()
const mockListEqChain: Record<string, any> = {};
mockListEqChain.eq = mock(() => mockListEqChain);
mockListEqChain.order = mockOrder;
mockListEqChain.single = mockSingle;

// Statement select chain: .select("*").eq("id",...) -> chain with .eq().single()
const mockStatementSelect = mock((_cols?: string) => ({
  eq: () => mockListEqChain,
}));

// mockFrom dispatches based on table name
const mockFrom = mock((table: string) => {
  if (table === "transactions") {
    return { select: mockTxnSelect };
  }
  return {
    select: mockStatementSelect,
  };
});

const mockSupabase = { from: mockFrom } as any;
const mockSupabaseAdmin = { from: mock() } as any;

const ctx: ServiceContext = {
  supabase: mockSupabase,
  supabaseAdmin: mockSupabaseAdmin,
  userId: TEST_USER_ID,
  email: TEST_EMAIL,
};

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockOrder.mockClear();
  mockSingle.mockClear();
  mockTxnEq.mockClear();
  mockTxnSelect.mockClear();
  mockListEqChain.eq.mockClear();
  mockStatementSelect.mockClear();
  mockFrom.mockClear();

  mockOrder.mockImplementation(() => Promise.resolve({ data: statementsList, error: null }));
  mockSingle.mockImplementation(() => Promise.resolve({ data: statementRecord, error: null }));
  mockTxnEq.mockImplementation(() => Promise.resolve({ data: transactionsList, error: null }));
  mockListEqChain.eq.mockImplementation(() => mockListEqChain);

  mockFrom.mockImplementation((table: string) => {
    if (table === "transactions") {
      return { select: mockTxnSelect };
    }
    return { select: mockStatementSelect };
  });
});

// ---------------------------------------------------------------------------
// Import service
// ---------------------------------------------------------------------------
const { listBankStatements, getBankStatement } = await import("../bank-statement.service");

// ===========================================================================
// listBankStatements
// ===========================================================================
describe("listBankStatements", () => {
  it("returns all statements for the user ordered by created_at desc", async () => {
    const { data, error } = await listBankStatements(ctx);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0].bank_name).toBe("Chase");
    expect(data![1].bank_name).toBe("Wells Fargo");
    expect(mockFrom).toHaveBeenCalledWith("bank_statements");
    expect(mockStatementSelect).toHaveBeenCalledWith("*");
    expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns error on database failure", async () => {
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await listBankStatements(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// getBankStatement
// ===========================================================================
describe("getBankStatement", () => {
  it("returns statement and transactions when found", async () => {
    const result = await getBankStatement(ctx, "stmt-1");

    expect(result.error).toBeNull();
    expect(result.statement).toBeDefined();
    expect(result.statement!.id).toBe("stmt-1");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions![0].description).toBe("Grocery store");
    expect(mockFrom).toHaveBeenCalledWith("bank_statements");
    expect(mockFrom).toHaveBeenCalledWith("transactions");
  });

  it("returns null statement and error when statement not found", async () => {
    mockSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const result = await getBankStatement(ctx, "stmt-nonexistent");

    expect(result.statement).toBeNull();
    expect(result.transactions).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("returns empty transactions array when statement has no transactions", async () => {
    mockTxnEq.mockImplementation(() => Promise.resolve({ data: null, error: null }));

    const result = await getBankStatement(ctx, "stmt-1");

    expect(result.error).toBeNull();
    expect(result.statement).toBeDefined();
    expect(result.transactions).toEqual([]);
  });
});
