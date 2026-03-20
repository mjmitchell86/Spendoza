import { describe, it, expect, mock } from "bun:test";

mock.module("../../lib/supabase", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ data: [], error: null }) }) }) }) }) },
  createSupabaseClient: () => ({}),
}));

const { looksLikeCreditCardPayment, findMatchingDebt } = await import(
  "../debt-payment-linker.service"
);

// ---------------------------------------------------------------------------
// looksLikeCreditCardPayment
// ---------------------------------------------------------------------------
describe("looksLikeCreditCardPayment", () => {
  it("detects typical credit card payment descriptions", () => {
    expect(looksLikeCreditCardPayment("CHASE CREDIT CARD PAYMENT")).toBe(true);
    expect(looksLikeCreditCardPayment("VISA AUTOPAY")).toBe(true);
    expect(looksLikeCreditCardPayment("CAPITAL ONE CARD PAYMENT")).toBe(true);
    expect(looksLikeCreditCardPayment("AMEX Payment Thank You")).toBe(true);
    expect(looksLikeCreditCardPayment("CITI BILL PAY")).toBe(true);
    expect(looksLikeCreditCardPayment("Wells Fargo Credit Card")).toBe(true);
    expect(looksLikeCreditCardPayment("DISCOVER CARD PAYMENT AUTO")).toBe(true);
    expect(looksLikeCreditCardPayment("BARCLAYS MINIMUM PAYMENT")).toBe(true);
    expect(looksLikeCreditCardPayment("Bank of America Mastercard")).toBe(true);
    expect(looksLikeCreditCardPayment("SYNCHRONY PAYMENT")).toBe(true);
  });

  it("rejects non-credit-card descriptions", () => {
    expect(looksLikeCreditCardPayment("AMAZON PURCHASE")).toBe(false);
    expect(looksLikeCreditCardPayment("GROCERY STORE")).toBe(false);
    expect(looksLikeCreditCardPayment("SPOTIFY SUBSCRIPTION")).toBe(false);
    expect(looksLikeCreditCardPayment("ELECTRIC COMPANY")).toBe(false);
    expect(looksLikeCreditCardPayment("RENT DEPOSIT")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findMatchingDebt
// ---------------------------------------------------------------------------
describe("findMatchingDebt", () => {
  const debts = [
    { id: "d1", name: "Chase Sapphire", debt_type: "credit_card" },
    { id: "d2", name: "Capital One Venture", debt_type: "credit_card" },
    { id: "d3", name: "Student Loan", debt_type: "student_loan" },
    { id: "d4", name: "Home Mortgage", debt_type: "mortgage" },
  ];

  it("matches transaction to credit card debt by name similarity", () => {
    expect(findMatchingDebt("CHASE SAPPHIRE PAYMENT", debts)).toBe("d1");
    expect(findMatchingDebt("CAPITAL ONE VENTURE AUTOPAY", debts)).toBe("d2");
  });

  it("returns null for non-credit-card debts", () => {
    // Even if description matches student loan name, should not match
    expect(findMatchingDebt("STUDENT LOAN PAYMENT", debts)).toBe(null);
  });

  it("returns null when no debts match", () => {
    expect(findMatchingDebt("RANDOM PAYMENT XYZ", debts)).toBe(null);
  });

  it("returns null for empty debts list", () => {
    expect(findMatchingDebt("CHASE PAYMENT", [])).toBe(null);
  });

  it("picks the best match when multiple debts could match", () => {
    const similarDebts = [
      { id: "d1", name: "Chase Freedom", debt_type: "credit_card" },
      { id: "d2", name: "Chase Sapphire Reserve", debt_type: "credit_card" },
    ];
    // "CHASE SAPPHIRE" should match d2 better than d1
    expect(findMatchingDebt("CHASE SAPPHIRE PAYMENT", similarDebts)).toBe("d2");
  });
});
