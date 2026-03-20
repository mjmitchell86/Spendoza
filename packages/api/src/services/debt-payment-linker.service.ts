import { supabaseAdmin } from "../lib/supabase";
import { similarity } from "../ai/expense-matcher";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate a transaction is a credit card payment.
 * Uses word-boundary regex to avoid false positives (e.g. "chase" in "purchase").
 */
const CREDIT_CARD_PATTERNS: RegExp[] = [
  /\bpayment\b/,
  /\bcredit card\b/,
  /\bcard payment\b/,
  /\bvisa\b/,
  /\bmastercard\b/,
  /\bamex\b/,
  /\bamerican express\b/,
  /\bdiscover\b/,
  /\bcapital one\b/,
  /\bchase\b/,
  /\bciti\b/,
  /\bbarclays\b/,
  /\bwells fargo\b/,
  /\bbank of america\b/,
  /\bsynchrony\b/,
  /\bautopay\b/,
  /\bauto pay\b/,
  /\bminimum payment\b/,
  /\bbill pay\b/,
];

const SIMILARITY_THRESHOLD = 0.15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a transaction description looks like a credit card payment.
 */
export function looksLikeCreditCardPayment(description: string): boolean {
  const lower = description.toLowerCase();
  return CREDIT_CARD_PATTERNS.some((pattern) => pattern.test(lower));
}

/**
 * Attempts to match a debit transaction to a credit card debt by comparing
 * the transaction description against debt names.
 *
 * Returns the best matching debt_id or null.
 */
export function findMatchingDebt(
  description: string,
  debts: Array<{ id: string; name: string; debt_type: string }>
): string | null {
  // Only match against credit card debts
  const creditCardDebts = debts.filter((d) => d.debt_type === "credit_card");
  if (creditCardDebts.length === 0) return null;

  let bestScore = 0;
  let bestDebtId: string | null = null;

  for (const debt of creditCardDebts) {
    const score = similarity(description, debt.name);
    if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
      bestScore = score;
      bestDebtId = debt.id;
    }
  }

  return bestDebtId;
}

// ---------------------------------------------------------------------------
// Auto-link transactions to debts
// ---------------------------------------------------------------------------

/**
 * Scans unlinked debit transactions for a user and attempts to auto-link
 * them to credit card debts. Called after bank statement processing.
 *
 * Only links transactions that:
 * 1. Are debit type (payments going out)
 * 2. Have descriptions matching credit card payment keywords
 * 3. Match a credit card debt name via similarity
 * 4. Don't already have a matched_debt_id
 */
export async function linkPaymentsToDebts(userId: string): Promise<number> {
  // 1. Fetch user's credit card debts
  const { data: debts } = await supabaseAdmin
    .from("debts")
    .select("id, name, debt_type")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .eq("debt_type", "credit_card");

  if (!debts || debts.length === 0) {
    return 0;
  }

  // 2. Fetch unlinked debit transactions (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const { data: transactions } = await supabaseAdmin
    .from("transactions")
    .select("id, description, amount, type")
    .eq("user_id", userId)
    .eq("type", "debit")
    .is("matched_debt_id", null)
    .gte("date", twelveMonthsAgo.toISOString().slice(0, 10));

  if (!transactions || transactions.length === 0) {
    return 0;
  }

  // 3. Find and link matches
  let linkedCount = 0;
  for (const txn of transactions) {
    if (!looksLikeCreditCardPayment(txn.description)) continue;

    const debtId = findMatchingDebt(txn.description, debts);
    if (!debtId) continue;

    const { error } = await supabaseAdmin
      .from("transactions")
      .update({ matched_debt_id: debtId })
      .eq("id", txn.id);

    if (!error) {
      linkedCount++;
    }
  }

  if (linkedCount > 0) {
    console.log(
      `[debt-payment-linker] Linked ${linkedCount} payment(s) to credit card debts for user ${userId}`
    );
  }

  return linkedCount;
}
