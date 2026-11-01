import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllocationBreakdown } from "../ai/report-insights";

/**
 * How a category's money counts. `savings` is money kept (moved to savings, paying down debt);
 * `transfer` is money moving between the person's own accounts (incl. credit-card payments) and
 * counts as neither income nor spending.
 */
export type FlowClass = "need" | "want" | "savings" | "transfer" | "other";

export type ClassOf = (category: string) => FlowClass | undefined;

export interface FlowTransaction {
  type: string;
  amount: number | string | null;
  ai_category?: string | null;
}

export interface CategoryTotal {
  category: string;
  amount: number;
  percentage: number;
}

export interface MoneyFlows {
  /** Credits, without transfers. */
  income: number;
  /** Debits that were spent: needs, wants, other and unknown categories. */
  spending: number;
  /** Debits kept: savings-class categories. */
  saved: number;
  /** Debits by category without transfers, largest first; percentages are of spending plus saved. */
  byCategory: CategoryTotal[];
  /** (income − spending) as a percent of income, 2 decimals; negative when spending beat income; 0 with no income. */
  savingsRate: number;
}

/** Case-insensitive lookup from a user's categories (`name`, `budget_class`). */
export function classMapFrom(categories: Array<{ name: string; budget_class: string }>): ClassOf {
  const map = new Map<string, FlowClass>();
  for (const c of categories) {
    if (!map.has(c.name.toLowerCase())) map.set(c.name.toLowerCase(), c.budget_class as FlowClass);
  }
  return (category) => map.get(category.toLowerCase());
}

function pct(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 10000) / 100;
}

export function summarizeFlows(transactions: FlowTransaction[], classOf: ClassOf): MoneyFlows {
  let income = 0;
  let spending = 0;
  let saved = 0;
  const categoryMap = new Map<string, number>();

  for (const t of transactions) {
    const amount = Number(t.amount ?? 0);
    const category = t.ai_category ?? "Uncategorized";
    const flowClass = classOf(category);
    if (flowClass === "transfer") continue;

    if (t.type === "credit") {
      income += amount;
    } else if (t.type === "debit") {
      if (flowClass === "savings") saved += amount;
      else spending += amount;
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + amount);
    }
  }

  const outflow = spending + saved;
  const byCategory = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({ category, amount, percentage: pct(amount, outflow) }))
    .sort((a, b) => b.amount - a.amount);

  return { income, spending, saved, byCategory, savingsRate: pct(income - spending, income) };
}

/**
 * Needs, wants and savings as a share of income (the health score's 50/30/20 rules are about income).
 * With no income, any amount counts as 100%, so spending with no income never earns full points.
 */
export function allocationFor(byCategory: CategoryTotal[], classOf: ClassOf, income: number): AllocationBreakdown {
  const totals = { need: 0, want: 0, savings: 0, other: 0 };
  for (const c of byCategory) {
    const flowClass = classOf(c.category);
    const bucket = flowClass === "need" || flowClass === "want" || flowClass === "savings" ? flowClass : "other";
    totals[bucket] += c.amount;
  }
  const share = (amount: number) =>
    income > 0 ? Math.round((amount / income) * 1000) / 10 : amount > 0 ? 100 : 0;

  return {
    needs: { amount: totals.need, percentage: share(totals.need) },
    wants: { amount: totals.want, percentage: share(totals.want) },
    savings: { amount: totals.savings, percentage: share(totals.savings) },
    unclassified: { amount: totals.other, percentage: share(totals.other) },
    benchmark: { needs: 50, wants: 30, savings: 20 },
  };
}

/**
 * How each category's money counts, from these users' categories. The first user's categories win
 * when two users have the same category name (pass the household head first).
 */
export async function loadClassOf(userIds: string[], db: SupabaseClient): Promise<ClassOf> {
  if (userIds.length === 0) return () => undefined;
  const { data: categories } = await db
    .from("categories")
    .select("user_id, name, budget_class")
    .in("user_id", userIds);
  const rank = (id: string) => userIds.indexOf(id);
  const ordered = [...(categories ?? [])].sort((a: any, b: any) => rank(a.user_id) - rank(b.user_id));
  return classMapFrom(ordered as Array<{ name: string; budget_class: string }>);
}
