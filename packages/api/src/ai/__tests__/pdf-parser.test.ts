import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const SAMPLE_BANK_TEXT = `
CHASE BANK STATEMENT
Account: ****1234
Statement Period: January 1 - January 31, 2026

Date        Description                     Amount
01/05/2026  WALMART SUPERCENTER #1234       -52.43
01/10/2026  SHELL GAS STATION               -35.00
01/15/2026  PAYROLL DEPOSIT                +2,500.00
01/20/2026  NETFLIX SUBSCRIPTION             -15.99
01/25/2026  AMAZON.COM                       -89.97
`;

const EXPECTED_TRANSACTIONS = [
  {
    date: "2026-01-05",
    description: "WALMART SUPERCENTER #1234",
    amount: 52.43,
    type: "debit",
  },
  {
    date: "2026-01-10",
    description: "SHELL GAS STATION",
    amount: 35.0,
    type: "debit",
  },
  {
    date: "2026-01-15",
    description: "PAYROLL DEPOSIT",
    amount: 2500.0,
    type: "credit",
  },
  {
    date: "2026-01-20",
    description: "NETFLIX SUBSCRIPTION",
    amount: 15.99,
    type: "debit",
  },
  {
    date: "2026-01-25",
    description: "AMAZON.COM",
    amount: 89.97,
    type: "debit",
  },
];

// ---------------------------------------------------------------------------
// Mock pdf-parse before importing the module under test
// ---------------------------------------------------------------------------
const mockGetText = mock(() =>
  Promise.resolve({ text: SAMPLE_BANK_TEXT, pages: [] })
);

mock.module("pdf-parse", () => ({
  PDFParse: class MockPDFParse {
    constructor(_opts?: any) {}
    getText = mockGetText;
  },
}));

// ---------------------------------------------------------------------------
// Mock @langchain/openai ChatOpenAI
// ---------------------------------------------------------------------------
const mockInvoke = mock(() =>
  Promise.resolve({
    content: JSON.stringify({ transactions: EXPECTED_TRANSACTIONS }),
  })
);

mock.module("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor(_opts?: any) {}
    invoke = mockInvoke;
  },
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
const { extractTextFromPDF, extractTransactions } = await import(
  "../pdf-parser"
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockGetText.mockClear();
  mockInvoke.mockClear();

  mockGetText.mockImplementation(() =>
    Promise.resolve({ text: SAMPLE_BANK_TEXT, pages: [] })
  );

  mockInvoke.mockImplementation(() =>
    Promise.resolve({
      content: JSON.stringify({ transactions: EXPECTED_TRANSACTIONS }),
    })
  );
});

describe("extractTextFromPDF", () => {
  it("extracts text from a PDF buffer using PDFParse", async () => {
    const buffer = Buffer.from("fake-pdf-content");
    const text = await extractTextFromPDF(buffer);

    expect(mockGetText).toHaveBeenCalledTimes(1);
    expect(text).toBe(SAMPLE_BANK_TEXT);
  });

  it("propagates errors from PDFParse", async () => {
    mockGetText.mockImplementation(() =>
      Promise.reject(new Error("Invalid PDF"))
    );

    const buffer = Buffer.from("not-a-pdf");
    await expect(extractTextFromPDF(buffer)).rejects.toThrow("Invalid PDF");
  });
});

describe("extractTransactions", () => {
  it("sends text to ChatOpenAI and returns parsed transactions", async () => {
    const result = await extractTransactions(SAMPLE_BANK_TEXT);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({
      date: "2026-01-05",
      description: "WALMART SUPERCENTER #1234",
      amount: 52.43,
      type: "debit",
    });
    expect(result[2]).toEqual({
      date: "2026-01-15",
      description: "PAYROLL DEPOSIT",
      amount: 2500.0,
      type: "credit",
    });
  });

  it("includes bank-specific hints when bankName is provided", async () => {
    await extractTransactions(SAMPLE_BANK_TEXT, "Chase");

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    // Verify the prompt includes the bank name
    const callArgs = mockInvoke.mock.calls[0][0];
    const promptContent = Array.isArray(callArgs)
      ? callArgs.map((m: any) => m.content).join(" ")
      : typeof callArgs === "string"
        ? callArgs
        : JSON.stringify(callArgs);
    expect(promptContent.toLowerCase()).toContain("chase");
  });

  it("handles empty transactions response", async () => {
    mockInvoke.mockImplementation(() =>
      Promise.resolve({
        content: JSON.stringify({ transactions: [] }),
      })
    );

    const result = await extractTransactions("Empty statement text");
    expect(result).toEqual([]);
  });

  it("handles AI returning transactions as top-level array", async () => {
    mockInvoke.mockImplementation(() =>
      Promise.resolve({
        content: JSON.stringify([EXPECTED_TRANSACTIONS[0]]),
      })
    );

    const result = await extractTransactions(SAMPLE_BANK_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("WALMART SUPERCENTER #1234");
  });

  it("ensures all amounts are positive numbers", async () => {
    mockInvoke.mockImplementation(() =>
      Promise.resolve({
        content: JSON.stringify({
          transactions: [
            {
              date: "2026-01-05",
              description: "REFUND",
              amount: -52.43,
              type: "credit",
            },
          ],
        }),
      })
    );

    const result = await extractTransactions(SAMPLE_BANK_TEXT);
    expect(result[0].amount).toBe(52.43);
    expect(result[0].amount).toBeGreaterThan(0);
  });
});
