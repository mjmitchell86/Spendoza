import { supabaseAdmin } from "../lib/supabase";
import { similarity } from "../ai/expense-matcher";
import { generateFriendlyNames } from "../ai/friendly-name-generator";
import {
  normalizeDescription,
  detectInterval,
} from "./bill-detection.service";
import type { RecurrenceInterval } from "@spendoza/shared";
import type { Frequency } from "@spendoza/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LOOKBACK_MONTHS = 12;
const MIN_OCCURRENCES = 3;
const AMOUNT_TOLERANCE = 0.1;
const STALENESS_MULTIPLIER = 2;
const SIMILARITY_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map RecurrenceInterval → Frequency (income uses Frequency enum). */
function intervalToFrequency(
  interval: RecurrenceInterval
): Frequency | null {
  switch (interval) {
    case "weekly":
      return "weekly";
    case "biweekly":
      return "biweekly";
    case "monthly":
      return "monthly";
    case "annually":
      return "annually";
    case "quarterly":
      // No direct Frequency match — skip
      return null;
    default:
      return null;
  }
}

/** Interval definitions in days (mirrors bill-detection). */
const INTERVAL_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  annually: 365,
};

/** Get the staleness threshold in days for a frequency. */
function stalenessThresholdDays(freq: Frequency): number {
  return (INTERVAL_DAYS[freq] ?? 30) * STALENESS_MULTIPLIER;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Transaction {
  description: string;
  amount: number;
  date: string;
  type: string;
}

interface DetectedIncome {
  description: string;
  amount: number;
  frequency: Frequency;
  firstDate: string;
  lastDate: string;
  dates: string[];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function detectRecurringIncome(userId: string): Promise<void> {
  // 1. Fetch all credit transactions for user (last 12 months)
  const lookbackDate = new Date();
  lookbackDate.setMonth(lookbackDate.getMonth() - LOOKBACK_MONTHS);
  const lookbackStr = lookbackDate.toISOString().slice(0, 10);

  const { data: transactions, error: txError } = await supabaseAdmin
    .from("transactions")
    .select("description, amount, date, type")
    .eq("user_id", userId)
    .eq("type", "credit")
    .gte("date", lookbackStr)
    .order("date", { ascending: true });

  if (txError || !transactions || transactions.length === 0) return;

  // 2. Normalize and group by description
  const groups = groupTransactions(transactions as Transaction[]);

  // 3. Detect patterns
  const detectedIncome = detectPatterns(groups);

  if (detectedIncome.length === 0) {
    // Still need to expire stale entries even if no new patterns detected
    await expireStaleIncome(userId, []);
    return;
  }

  // 4. Generate friendly names for detected income (non-fatal)
  let friendlyNames = new Map<string, string>();
  try {
    const rawDescriptions = detectedIncome.map((d) => d.description);
    friendlyNames = await generateFriendlyNames(rawDescriptions);
  } catch (err) {
    console.error("[income-detection] friendly name generation failed:", err);
  }

  // 5. Fetch existing auto-detected income entries
  const { data: existingIncome } = await supabaseAdmin
    .from("income_entries")
    .select(
      "id, source_name, friendly_name, amount, auto_detected, end_date, frequency, last_seen_at"
    )
    .eq("user_id", userId)
    .eq("auto_detected", true);

  const existing = existingIncome ?? [];

  // 6. Upsert detected income
  const matchedExistingIds = new Set<string>();

  for (const income of detectedIncome) {
    const friendlyName = friendlyNames.get(income.description) ?? null;

    // Try to match to existing auto-detected income entry
    const match = existing.find(
      (e) =>
        similarity(
          normalizeDescription(e.source_name),
          normalizeDescription(income.description)
        ) >= SIMILARITY_THRESHOLD
    );

    if (match) {
      matchedExistingIds.add(match.id);
      // Update existing — only set friendly_name if not already set
      const update: Record<string, unknown> = {
        amount: income.amount,
        frequency: income.frequency,
        last_seen_at: income.lastDate,
        end_date: null, // Re-activate if previously expired
      };
      if (!match.friendly_name && friendlyName) {
        update.friendly_name = friendlyName;
      }
      await supabaseAdmin
        .from("income_entries")
        .update(update)
        .eq("id", match.id);
    } else {
      // Create new
      await supabaseAdmin.from("income_entries").insert({
        user_id: userId,
        source_name: income.description,
        friendly_name: friendlyName,
        amount: income.amount,
        frequency: income.frequency,
        effective_date: income.firstDate,
        end_date: null,
        auto_detected: true,
        last_seen_at: income.lastDate,
      });
    }
  }

  // 7. Expire stale income
  await expireStaleIncome(userId, Array.from(matchedExistingIds));
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
): DetectedIncome[] {
  const incomePatterns: DetectedIncome[] = [];

  for (const [, txns] of groups) {
    if (txns.length < MIN_OCCURRENCES) continue;

    // Verify amount consistency
    const amounts = txns.map((t) => t.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const allWithinTolerance = amounts.every(
      (a) => Math.abs(a - avgAmount) / avgAmount <= AMOUNT_TOLERANCE
    );
    if (!allWithinTolerance) continue;

    // Detect recurrence interval
    const dates = txns.map((t) => t.date);
    const interval = detectInterval(dates);
    if (!interval) continue;

    // Map to Frequency (skip quarterly — no Frequency equivalent)
    const freq = intervalToFrequency(interval);
    if (!freq) continue;

    const sortedDates = [...dates].sort();
    const firstDate = sortedDates[0];
    const lastDate = sortedDates[sortedDates.length - 1];

    // Use the original (non-normalized) description from the most recent txn
    const mostRecentTx = txns.reduce((a, b) =>
      a.date >= b.date ? a : b
    );

    incomePatterns.push({
      description: mostRecentTx.description,
      amount: Math.round(avgAmount * 100) / 100,
      frequency: freq,
      firstDate,
      lastDate,
      dates,
    });
  }

  return incomePatterns;
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

async function expireStaleIncome(
  userId: string,
  matchedIds: string[]
): Promise<void> {
  const { data: autoIncome } = await supabaseAdmin
    .from("income_entries")
    .select("id, last_seen_at, frequency, end_date")
    .eq("user_id", userId)
    .eq("auto_detected", true);

  if (!autoIncome) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  for (const entry of autoIncome) {
    // Skip entries we just matched/updated
    if (matchedIds.includes(entry.id)) continue;

    // Skip if already expired
    if (entry.end_date) continue;

    // Check staleness
    if (entry.last_seen_at && entry.frequency) {
      const lastSeen = new Date(entry.last_seen_at);
      const daysSinceLastSeen = Math.round(
        (today.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)
      );
      const threshold = stalenessThresholdDays(entry.frequency);

      if (daysSinceLastSeen > threshold) {
        await supabaseAdmin
          .from("income_entries")
          .update({ end_date: todayStr })
          .eq("id", entry.id);
      }
    }
  }
}
