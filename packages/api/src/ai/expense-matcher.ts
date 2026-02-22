import type { ClassifiedTransaction } from "./transaction-classifier";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MatchedTransaction extends ClassifiedTransaction {
  matched_expense_id: string | null;
  matched_income_id: string | null;
}

// ---------------------------------------------------------------------------
// String similarity
// ---------------------------------------------------------------------------

/**
 * Computes a simple similarity score between two strings (0 to 1).
 *
 * Uses a combined approach:
 * 1. Tokenizes both strings into words
 * 2. Counts shared tokens (Jaccard-like overlap)
 *
 * Case-insensitive comparison.
 */
export function similarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const na = normalize(a);
  const nb = normalize(b);

  // Exact match after normalization
  if (na === nb) return 1;

  // Token-based overlap (Jaccard similarity)
  const tokensA = new Set(na.split(/\s+/).filter(Boolean));
  const tokensB = new Set(nb.split(/\s+/).filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Amount proximity check
// ---------------------------------------------------------------------------

/**
 * Returns true if two amounts are within 20% of each other.
 */
function isAmountClose(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true;
  const max = Math.max(a, b);
  if (max === 0) return true;
  const diff = Math.abs(a - b);
  return diff / max <= 0.2;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const SIMILARITY_THRESHOLD = 0.2;

/**
 * Matches transactions against existing expenses and income records.
 * This is a deterministic algorithm (no AI calls).
 *
 * - Debit transactions are matched against existing expenses
 * - Credit transactions are matched against existing income
 * - Matching uses description similarity + amount proximity (within 20%)
 */
export async function matchTransactions(
  transactions: ClassifiedTransaction[],
  existingExpenses: Array<{
    id: string;
    description: string;
    amount: number;
    category_id: string;
  }>,
  existingIncome: Array<{ id: string; source_name: string; amount: number }>
): Promise<MatchedTransaction[]> {
  return transactions.map((transaction) => {
    let matched_expense_id: string | null = null;
    let matched_income_id: string | null = null;

    if (transaction.type === "debit") {
      // Try to match against existing expenses
      let bestScore = 0;
      let bestExpenseId: string | null = null;

      for (const expense of existingExpenses) {
        if (!isAmountClose(transaction.amount, expense.amount)) {
          continue;
        }

        const score = similarity(transaction.description, expense.description);
        if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
          bestScore = score;
          bestExpenseId = expense.id;
        }
      }

      matched_expense_id = bestExpenseId;
    } else if (transaction.type === "credit") {
      // Try to match against existing income
      let bestScore = 0;
      let bestIncomeId: string | null = null;

      for (const income of existingIncome) {
        if (!isAmountClose(transaction.amount, income.amount)) {
          continue;
        }

        const score = similarity(transaction.description, income.source_name);
        if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
          bestScore = score;
          bestIncomeId = income.id;
        }
      }

      matched_income_id = bestIncomeId;
    }

    return {
      ...transaction,
      matched_expense_id,
      matched_income_id,
    };
  });
}
