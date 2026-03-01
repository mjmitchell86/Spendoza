import { supabaseAdmin } from "../lib/supabase";
import { similarity } from "../ai/expense-matcher";
import { generateFriendlyNames } from "../ai/friendly-name-generator";
import type { RecurrenceInterval } from "@spendoza/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LOOKBACK_MONTHS = 12;
const MIN_OCCURRENCES = 2;
const AMOUNT_TOLERANCE = 0.1;
const MORTGAGE_AMOUNT_TOLERANCE = 0.25;
const STALENESS_MULTIPLIER = 2;
const SIMILARITY_THRESHOLD = 0.6;

/**
 * Category keywords that indicate a likely recurring bill.
 * Only transactions whose ai_category matches one of these patterns will be
 * auto-detected. This prevents flagging regular spending at the same store
 * (groceries, dining, shopping) as a "bill".
 */
const BILL_CATEGORY_KEYWORDS = [
  // Subscriptions & streaming
  "subscription", "streaming", "membership",
  // Utilities
  "utility", "utilities", "electric", "power", "energy",
  "water", "sewer", "internet", "phone", "cable", "telecom",
  // Housing
  "housing", "rent", "mortgage",
  // Automotive
  "automotive", "car", "auto", "vehicle",
  // Insurance
  "insurance",
  // Loans & debt
  "loan", "debt",
  // Health & fitness (gym memberships)
  "health", "fitness", "gym",
  // Software / SaaS
  "software", "cloud", "saas",
];

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Strip variable parts from a transaction description for grouping. */
export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // strip punctuation
    .replace(/\b\d{5,}\b/g, "") // remove long numbers (refs, phone numbers)
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

/** Check if an ai_category matches a bill-like category. */
export function isBillLikeCategory(aiCategory: string | null): boolean {
  if (!aiCategory) return false;
  const lower = aiCategory.toLowerCase();
  return BILL_CATEGORY_KEYWORDS.some((kw) => lower.includes(kw));
}

const MORTGAGE_KEYWORDS = ["mortgage", "home loan"];

/** Check if an ai_category is mortgage-related (needs higher amount tolerance). */
function isMortgageCategory(aiCategory: string | null): boolean {
  if (!aiCategory) return false;
  const lower = aiCategory.toLowerCase();
  return MORTGAGE_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Interval definitions in days. */
const INTERVAL_DEFS: { name: RecurrenceInterval; days: number; tolerance: number }[] = [
  { name: "weekly", days: 7, tolerance: 2 },
  { name: "biweekly", days: 14, tolerance: 3 },
  { name: "monthly", days: 30, tolerance: 5 },
  { name: "quarterly", days: 91, tolerance: 15 },
  { name: "annually", days: 365, tolerance: 30 },
];

/**
 * Detect the recurrence interval from a sorted array of dates.
 * Returns the interval name or null if no pattern detected.
 */
export function detectInterval(dates: string[]): RecurrenceInterval | null {
  if (dates.length < 2) return null;

  const sorted = [...dates].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d1 = new Date(sorted[i - 1] + "T00:00:00");
    const d2 = new Date(sorted[i] + "T00:00:00");
    gaps.push(Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  for (const def of INTERVAL_DEFS) {
    if (Math.abs(avgGap - def.days) <= def.tolerance) {
      return def.name;
    }
  }

  return null;
}

/** Project the next due date from the last seen date and interval. */
export function calculateNextDueDate(
  lastDate: string,
  interval: RecurrenceInterval
): string {
  const d = new Date(lastDate + "T00:00:00");

  switch (interval) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "annually":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }

  return d.toISOString().slice(0, 10);
}

/** Get the staleness threshold in days for an interval. */
function stalenessThresholdDays(interval: RecurrenceInterval): number {
  const def = INTERVAL_DEFS.find((d) => d.name === interval);
  return (def?.days ?? 30) * STALENESS_MULTIPLIER;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Transaction {
  description: string;
  amount: number;
  date: string;
  type: string;
  ai_category: string | null;
}

interface DetectedBill {
  description: string;
  amount: number;
  interval: RecurrenceInterval;
  lastDate: string;
  nextDueDate: string;
  categoryName: string | null;
  dates: string[];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function detectRecurringBills(userId: string): Promise<void> {
  // 1. Fetch all debit transactions for user (last 12 months)
  const lookbackDate = new Date();
  lookbackDate.setMonth(lookbackDate.getMonth() - LOOKBACK_MONTHS);
  const lookbackStr = lookbackDate.toISOString().slice(0, 10);

  const { data: transactions, error: txError } = await supabaseAdmin
    .from("transactions")
    .select("description, amount, date, type, ai_category")
    .eq("user_id", userId)
    .eq("type", "debit")
    .gte("date", lookbackStr)
    .order("date", { ascending: true });

  if (txError || !transactions || transactions.length === 0) return;

  // 2. Normalize and group by description
  const groups = groupTransactions(transactions as Transaction[]);

  // 3. Detect patterns
  const detectedBills = detectPatterns(groups);

  if (detectedBills.length === 0 && transactions.length > 0) {
    // Still need to expire stale bills even if no new patterns detected
    await expireStaleBills(userId, []);
    return;
  }

  // 4. Fetch user's categories for mapping ai_category -> category_id
  const { data: categories } = await supabaseAdmin
    .from("categories")
    .select("id, name")
    .eq("user_id", userId);

  const categoryMap = new Map(
    (categories ?? []).map((c: { id: string; name: string }) => [
      c.name.toLowerCase(),
      c.id,
    ])
  );

  // 5. Generate friendly names for detected bills (non-fatal)
  let friendlyNames = new Map<string, string>();
  try {
    const rawDescriptions = detectedBills.map((b) => b.description);
    friendlyNames = await generateFriendlyNames(rawDescriptions);
  } catch (err) {
    console.error("[bill-detection] friendly name generation failed:", err);
  }

  // 6. Fetch existing auto-detected expenses
  const { data: existingExpenses } = await supabaseAdmin
    .from("expenses")
    .select("id, description, friendly_name, amount, auto_detected, end_date, recurrence_interval, last_seen_at")
    .eq("user_id", userId)
    .eq("auto_detected", true);

  const existing = existingExpenses ?? [];

  // 7. Upsert detected bills
  const matchedExistingIds = new Set<string>();

  for (const bill of detectedBills) {
    const categoryId = resolveCategoryId(bill.categoryName, categoryMap);
    if (!categoryId) continue; // Skip if we can't map to a category

    const friendlyName = friendlyNames.get(bill.description) ?? null;

    // Try to match to existing auto-detected expense
    const match = existing.find(
      (e) => similarity(normalizeDescription(e.description), normalizeDescription(bill.description)) >= SIMILARITY_THRESHOLD
    );

    if (match) {
      matchedExistingIds.add(match.id);
      // Update existing — only set friendly_name if it doesn't already have one
      const update: Record<string, unknown> = {
        amount: bill.amount,
        recurrence_interval: bill.interval,
        next_due_date: bill.nextDueDate,
        last_seen_at: bill.lastDate,
        end_date: null, // Re-activate if previously expired
      };
      if (!match.friendly_name && friendlyName) {
        update.friendly_name = friendlyName;
      }
      await supabaseAdmin
        .from("expenses")
        .update(update)
        .eq("id", match.id);
    } else {
      // Create new
      await supabaseAdmin.from("expenses").insert({
        user_id: userId,
        category_id: categoryId,
        description: bill.description,
        friendly_name: friendlyName,
        amount: bill.amount,
        frequency: "recurring" as const,
        recurrence_interval: bill.interval,
        next_due_date: bill.nextDueDate,
        end_date: null,
        auto_detected: true,
        last_seen_at: bill.lastDate,
      });
    }
  }

  // 8. Expire stale bills
  await expireStaleBills(userId, Array.from(matchedExistingIds));
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupTransactions(
  transactions: Transaction[]
): Map<string, Transaction[]> {
  // First pass: group by exact normalized description
  const exactGroups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = normalizeDescription(tx.description);
    if (!key) continue;
    const group = exactGroups.get(key) ?? [];
    group.push(tx);
    exactGroups.set(key, group);
  }

  // Second pass: merge similar groups
  const mergedGroups = new Map<string, Transaction[]>();
  const keys = Array.from(exactGroups.keys());

  const merged = new Set<string>();
  for (let i = 0; i < keys.length; i++) {
    if (merged.has(keys[i])) continue;

    const group = [...exactGroups.get(keys[i])!];
    for (let j = i + 1; j < keys.length; j++) {
      if (merged.has(keys[j])) continue;
      if (similarity(keys[i], keys[j]) >= SIMILARITY_THRESHOLD) {
        group.push(...exactGroups.get(keys[j])!);
        merged.add(keys[j]);
      }
    }

    mergedGroups.set(keys[i], group);
  }

  return mergedGroups;
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

function detectPatterns(
  groups: Map<string, Transaction[]>
): DetectedBill[] {
  const bills: DetectedBill[] = [];

  for (const [, txns] of groups) {
    if (txns.length < MIN_OCCURRENCES) continue;

    // Determine the most common ai_category first (needed for tolerance selection)
    const categoryCounts = new Map<string, number>();
    for (const tx of txns) {
      if (tx.ai_category) {
        categoryCounts.set(
          tx.ai_category,
          (categoryCounts.get(tx.ai_category) ?? 0) + 1
        );
      }
    }
    let bestCategory: string | null = null;
    let bestCount = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > bestCount) {
        bestCategory = cat;
        bestCount = count;
      }
    }

    // Only auto-detect bills in bill-like categories
    if (!isBillLikeCategory(bestCategory)) continue;

    // Verify amount consistency — mortgages get higher tolerance due to escrow variability
    const tolerance = isMortgageCategory(bestCategory)
      ? MORTGAGE_AMOUNT_TOLERANCE
      : AMOUNT_TOLERANCE;
    const amounts = txns.map((t) => t.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const allWithinTolerance = amounts.every(
      (a) => Math.abs(a - avgAmount) / avgAmount <= tolerance
    );
    if (!allWithinTolerance) continue;

    // Detect recurrence interval
    const dates = txns.map((t) => t.date);
    const interval = detectInterval(dates);
    if (!interval) continue;

    const sortedDates = [...dates].sort();
    const lastDate = sortedDates[sortedDates.length - 1];

    // Use the original (non-normalized) description from the most recent txn
    const mostRecentTx = txns.reduce((a, b) =>
      a.date >= b.date ? a : b
    );

    bills.push({
      description: mostRecentTx.description,
      amount: Math.round(avgAmount * 100) / 100,
      interval,
      lastDate,
      nextDueDate: calculateNextDueDate(lastDate, interval),
      categoryName: bestCategory,
      dates,
    });
  }

  return bills;
}

// ---------------------------------------------------------------------------
// Category resolution
// ---------------------------------------------------------------------------

function resolveCategoryId(
  aiCategory: string | null,
  categoryMap: Map<string, string>
): string | null {
  if (!aiCategory) return null;
  // Exact match (case-insensitive)
  const id = categoryMap.get(aiCategory.toLowerCase());
  if (id) return id;

  // Fuzzy match
  let bestScore = 0;
  let bestId: string | null = null;
  for (const [name, catId] of categoryMap) {
    const score = similarity(aiCategory.toLowerCase(), name);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestId = catId;
    }
  }

  return bestId;
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

async function expireStaleBills(
  userId: string,
  matchedIds: string[]
): Promise<void> {
  const { data: autoExpenses } = await supabaseAdmin
    .from("expenses")
    .select("id, last_seen_at, recurrence_interval, end_date")
    .eq("user_id", userId)
    .eq("auto_detected", true);

  if (!autoExpenses) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  for (const expense of autoExpenses) {
    // Skip expenses we just matched/updated
    if (matchedIds.includes(expense.id)) continue;

    // Skip if already expired
    if (expense.end_date) continue;

    // Check staleness
    if (expense.last_seen_at && expense.recurrence_interval) {
      const lastSeen = new Date(expense.last_seen_at);
      const daysSinceLastSeen = Math.round(
        (today.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)
      );
      const threshold = stalenessThresholdDays(expense.recurrence_interval);

      if (daysSinceLastSeen > threshold) {
        await supabaseAdmin
          .from("expenses")
          .update({ end_date: todayStr })
          .eq("id", expense.id);
      }
    }
  }
}
