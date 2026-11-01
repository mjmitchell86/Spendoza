import type { ServiceContext } from "./context";
import { loadClassOf, summarizeFlows, type ClassOf } from "../lib/money-flows";

// ---------------------------------------------------------------------------
// Helper: derive date range for a month string (YYYY-MM-01)
// ---------------------------------------------------------------------------
export function monthRange(month: string) {
  const startDate = month.slice(0, 7) + "-01";
  const endYear = parseInt(month.slice(0, 4));
  const endMonth = parseInt(month.slice(5, 7));
  const nextMonth =
    endMonth === 12
      ? `${endYear + 1}-01-01`
      : `${endYear}-${String(endMonth + 1).padStart(2, "0")}-01`;
  return { startDate, nextMonth };
}

// ---------------------------------------------------------------------------
// Helper: get current month string (YYYY-MM-01)
// ---------------------------------------------------------------------------
export function currentMonthStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// ---------------------------------------------------------------------------
// Helper: aggregate transaction arrays into dashboard shape. `classOf` says how each category counts:
// savings-class categories are saved (not spent), transfer-class ones are neither income nor spending.
// ---------------------------------------------------------------------------
export function aggregateTransactions(txns: any[], classOf: ClassOf = () => undefined) {
  const flows = summarizeFlows(txns, classOf);

  return {
    summary: {
      total_income: flows.income,
      total_expenses: flows.spending,
      total_saved: flows.saved,
      savings_rate: flows.savingsRate,
      net: flows.income - flows.spending,
    },
    by_category: flows.byCategory,
    trends: { income_change: 0, expense_change: 0 },
    insights: null,
  };
}

// ---------------------------------------------------------------------------
// Helper: normalize by_category (handles legacy object format)
// ---------------------------------------------------------------------------
function normalizeByCategoryArray(
  raw: unknown
): Array<{ category: string; amount: number; percentage: number }> {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const entries = Object.entries(raw as Record<string, number>);
    const total = entries.reduce((sum, [, amt]) => sum + amt, 0);
    return entries
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Helper: transform report into dashboard shape
// ---------------------------------------------------------------------------
export function toDashboardResponse(report: any) {
  const rd = report.report_data as any;

  return {
    summary: {
      total_income: rd.total_income,
      total_expenses: rd.total_expenses,
      savings_rate: rd.savings_rate,
      net: rd.total_income - rd.total_expenses,
    },
    by_category: normalizeByCategoryArray(rd.by_category),
    trends: rd.month_over_month ?? { income_change: 0, expense_change: 0 },
    insights: report.ai_insights ?? null,
  };
}

// ---------------------------------------------------------------------------
// Helper: find the most recent month that has transactions for a user
// ---------------------------------------------------------------------------
async function findLatestTransactionMonth(
  userId: string,
  db: any
): Promise<string | null> {
  const { data } = await db
    .from("transactions")
    .select("date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  const d = data[0].date as string;
  return d.slice(0, 7) + "-01";
}

// ---------------------------------------------------------------------------
// Helper: find latest month with transactions for any household member
// ---------------------------------------------------------------------------
async function findLatestHouseholdTransactionMonth(
  ctx: ServiceContext,
  householdId: string
): Promise<string | null> {
  const { data: members } = await ctx.supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);

  const memberIds = (members ?? []).map((m: any) => m.id);
  if (memberIds.length === 0) return null;

  const { data } = await ctx.supabaseAdmin
    .from("transactions")
    .select("date")
    .in("user_id", memberIds)
    .order("date", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  return (data[0].date as string).slice(0, 7) + "-01";
}

// ---------------------------------------------------------------------------
// Helper: compute dashboard data from transactions for a single month
// ---------------------------------------------------------------------------
async function computeFromTransactions(
  userId: string,
  month: string,
  db: any
) {
  const { startDate, nextMonth } = monthRange(month);

  const { data: transactions } = await db
    .from("transactions")
    .select("amount, type, ai_category, date")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lt("date", nextMonth);

  return aggregateTransactions(transactions ?? [], await loadClassOf([userId], db));
}

// ---------------------------------------------------------------------------
// Helper: compute dashboard data from transactions in a date range
// ---------------------------------------------------------------------------
async function computeFromTransactionsRange(
  userId: string,
  fromDate: string | undefined,
  toDate: string | undefined,
  db: any
) {
  let query = db
    .from("transactions")
    .select("amount, type, ai_category, date")
    .eq("user_id", userId);

  if (fromDate) query = query.gte("date", fromDate);
  if (toDate) query = query.lte("date", toDate);

  const { data: transactions } = await query.order("date", {
    ascending: false,
  });

  return aggregateTransactions(transactions ?? [], await loadClassOf([userId], db));
}

// ---------------------------------------------------------------------------
// Helper: how a household's categories count — the head's categories first, like the household report
// ---------------------------------------------------------------------------
async function householdClassOf(ctx: ServiceContext, householdId: string, memberIds: string[]) {
  const { data: household } = await ctx.supabaseAdmin
    .from("households")
    .select("head_of_household_id")
    .eq("id", householdId)
    .single();
  const headId = household?.head_of_household_id as string | undefined;
  return loadClassOf(
    [...(headId ? [headId] : []), ...memberIds.filter((id) => id !== headId)],
    ctx.supabaseAdmin
  );
}

// ---------------------------------------------------------------------------
// Helper: compute household dashboard from members' transactions (month)
// ---------------------------------------------------------------------------
async function computeHouseholdFromTransactions(
  ctx: ServiceContext,
  householdId: string,
  month: string
) {
  const { startDate, nextMonth } = monthRange(month);

  const { data: members } = await ctx.supabaseAdmin
    .from("profiles")
    .select("id, display_name, income_sharing_mode, expense_sharing_mode")
    .eq("household_id", householdId);

  const classOf = await householdClassOf(ctx, householdId, (members ?? []).map((m: any) => m.id));
  const shared: any[] = [];
  const memberContributions: Array<{
    user_id: string;
    display_name: string;
    income: number;
    expenses: number;
  }> = [];

  for (const member of members ?? []) {
    const includeIncome = member.income_sharing_mode === "all";
    const includeExpenses = member.expense_sharing_mode === "all";
    if (!includeIncome && !includeExpenses) continue;

    const { data: transactions } = await ctx.supabaseAdmin
      .from("transactions")
      .select("amount, type, ai_category")
      .eq("user_id", member.id)
      .gte("date", startDate)
      .lt("date", nextMonth);

    const memberShared = (transactions ?? []).filter(
      (t: any) => (t.type === "credit" && includeIncome) || (t.type === "debit" && includeExpenses)
    );
    const memberFlows = summarizeFlows(memberShared, classOf);
    shared.push(...memberShared);
    memberContributions.push({
      user_id: member.id,
      display_name: member.display_name ?? "Member",
      income: memberFlows.income,
      expenses: memberFlows.spending,
    });
  }

  const flows = summarizeFlows(shared, classOf);

  return {
    summary: {
      total_income: flows.income,
      total_expenses: flows.spending,
      total_saved: flows.saved,
      savings_rate: flows.savingsRate,
      net: flows.income - flows.spending,
    },
    by_category: flows.byCategory,
    trends: { income_change: 0, expense_change: 0 },
    insights: null as string | null,
    member_contributions: memberContributions,
  };
}

// ---------------------------------------------------------------------------
// Helper: compute household dashboard from members' transactions (range)
// ---------------------------------------------------------------------------
async function computeHouseholdFromTransactionsRange(
  ctx: ServiceContext,
  householdId: string,
  fromDate: string | undefined,
  toDate: string | undefined
) {
  const { data: members } = await ctx.supabaseAdmin
    .from("profiles")
    .select("id, display_name, income_sharing_mode, expense_sharing_mode")
    .eq("household_id", householdId);

  const classOf = await householdClassOf(ctx, householdId, (members ?? []).map((m: any) => m.id));
  const shared: any[] = [];
  const memberContributions: Array<{
    user_id: string;
    display_name: string;
    income: number;
    expenses: number;
  }> = [];

  for (const member of members ?? []) {
    const includeIncome = member.income_sharing_mode === "all";
    const includeExpenses = member.expense_sharing_mode === "all";
    if (!includeIncome && !includeExpenses) continue;

    let query = ctx.supabaseAdmin
      .from("transactions")
      .select("amount, type, ai_category")
      .eq("user_id", member.id);

    if (fromDate) query = query.gte("date", fromDate);
    if (toDate) query = query.lte("date", toDate);

    const { data: transactions } = await query;

    const memberShared = (transactions ?? []).filter(
      (t: any) => (t.type === "credit" && includeIncome) || (t.type === "debit" && includeExpenses)
    );
    const memberFlows = summarizeFlows(memberShared, classOf);
    shared.push(...memberShared);
    memberContributions.push({
      user_id: member.id,
      display_name: member.display_name ?? "Member",
      income: memberFlows.income,
      expenses: memberFlows.spending,
    });
  }

  const flows = summarizeFlows(shared, classOf);

  return {
    summary: {
      total_income: flows.income,
      total_expenses: flows.spending,
      total_saved: flows.saved,
      savings_rate: flows.savingsRate,
      net: flows.income - flows.spending,
    },
    by_category: flows.byCategory,
    trends: { income_change: 0, expense_change: 0 },
    insights: null as string | null,
    member_contributions: memberContributions,
  };
}

// ===========================================================================
// Main exported service functions
// ===========================================================================

// ---------------------------------------------------------------------------
// getPersonalDashboardForMonth
// ---------------------------------------------------------------------------
export async function getPersonalDashboardForMonth(
  ctx: ServiceContext,
  month: string
) {
  const db = ctx.supabase;

  // Check if the requested month has transactions
  const { startDate: reqStart, nextMonth: reqNext } = monthRange(month);
  const { count: txnCount } = await db
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .gte("date", reqStart)
    .lt("date", reqNext);

  const hasTransactions = (txnCount ?? 0) > 0;

  // Always tell the frontend which month has the latest transactions
  const latestTransactionMonth = hasTransactions
    ? null
    : await findLatestTransactionMonth(ctx.userId, db);

  const { data: report } = await db
    .from("reports")
    .select("*")
    .eq("entity_type", "user")
    .eq("entity_id", ctx.userId)
    .eq("report_month", month)
    .maybeSingle();

  // Use report if it has meaningful data
  if (report) {
    const rd = report.report_data as any;
    if (rd.total_income > 0 || rd.total_expenses > 0) {
      return {
        ...toDashboardResponse(report),
        has_transactions: hasTransactions,
        latest_transaction_month: latestTransactionMonth,
        month,
      };
    }
  }

  // No report or report has no data — compute from transactions
  let dashboard = (await computeFromTransactions(
    ctx.userId,
    month,
    db
  )) as any;

  // Merge AI insights — try displayed month's report first, then find latest
  if (report?.ai_insights && !dashboard.insights) {
    dashboard.insights = report.ai_insights;
    dashboard.insights_month = month;
  }

  if (!dashboard.insights) {
    const { data: latestReport } = await db
      .from("reports")
      .select("ai_insights, report_month")
      .eq("entity_type", "user")
      .eq("entity_id", ctx.userId)
      .not("ai_insights", "is", null)
      .order("report_month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestReport?.ai_insights) {
      dashboard.insights = latestReport.ai_insights;
      dashboard.insights_month = latestReport.report_month;
    }
  }

  dashboard.has_transactions = hasTransactions;
  dashboard.latest_transaction_month = latestTransactionMonth;
  dashboard.month = month;

  return dashboard;
}

// ---------------------------------------------------------------------------
// getPersonalDashboardForRange
// ---------------------------------------------------------------------------
export async function getPersonalDashboardForRange(
  ctx: ServiceContext,
  fromDate: string | undefined,
  toDate: string | undefined
) {
  const db = ctx.supabase;

  const dashboard = (await computeFromTransactionsRange(
    ctx.userId,
    fromDate,
    toDate,
    db
  )) as any;

  // Check if there are any transactions in the range
  let countQuery = db
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId);
  if (fromDate) countQuery = countQuery.gte("date", fromDate);
  if (toDate) countQuery = countQuery.lte("date", toDate);
  const { count: txnCount } = await countQuery;
  dashboard.has_transactions = (txnCount ?? 0) > 0;

  if (!dashboard.has_transactions) {
    dashboard.latest_transaction_month = await findLatestTransactionMonth(
      ctx.userId,
      db
    );
  }

  // Find most recent AI insights
  const { data: latestReport } = await db
    .from("reports")
    .select("ai_insights, report_month")
    .eq("entity_type", "user")
    .eq("entity_id", ctx.userId)
    .not("ai_insights", "is", null)
    .order("report_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestReport?.ai_insights) {
    dashboard.insights = latestReport.ai_insights;
    dashboard.insights_month = latestReport.report_month;
  }

  return dashboard;
}

// ---------------------------------------------------------------------------
// getHouseholdDashboardForMonth
// ---------------------------------------------------------------------------
export async function getHouseholdDashboardForMonth(
  ctx: ServiceContext,
  householdId: string,
  month: string
) {
  // Get household member IDs
  const { data: hhMembers } = await ctx.supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);
  const hhMemberIds = (hhMembers ?? []).map((m: any) => m.id);

  let hasTransactions = false;
  if (hhMemberIds.length > 0) {
    const { startDate: reqStart, nextMonth: reqNext } = monthRange(month);
    const { count: txnCount } = await ctx.supabaseAdmin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .in("user_id", hhMemberIds)
      .gte("date", reqStart)
      .lt("date", reqNext);
    hasTransactions = (txnCount ?? 0) > 0;
  }

  // Always tell the frontend which month has the latest transactions
  const latestTransactionMonth = hasTransactions
    ? null
    : await findLatestHouseholdTransactionMonth(ctx, householdId);

  const { data: report } = await ctx.supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .eq("report_month", month)
    .maybeSingle();

  // Use report if it has meaningful data
  if (report) {
    const rd = report.report_data as any;
    if (rd.total_income > 0 || rd.total_expenses > 0) {
      return {
        ...toDashboardResponse(report),
        member_contributions: rd.member_contributions ?? [],
        has_transactions: hasTransactions,
        latest_transaction_month: latestTransactionMonth,
        month,
      };
    }
  }

  // No report or report has no data — compute from transactions
  let dashboard = (await computeHouseholdFromTransactions(
    ctx,
    householdId,
    month
  )) as any;

  // Merge AI insights — try displayed month's report first, then find latest
  if (report?.ai_insights && !dashboard.insights) {
    dashboard.insights = report.ai_insights;
    dashboard.insights_month = month;
  }

  if (!dashboard.insights) {
    const { data: latestReport } = await ctx.supabaseAdmin
      .from("reports")
      .select("ai_insights, report_month")
      .eq("entity_type", "household")
      .eq("entity_id", householdId)
      .not("ai_insights", "is", null)
      .order("report_month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestReport?.ai_insights) {
      dashboard.insights = latestReport.ai_insights;
      dashboard.insights_month = latestReport.report_month;
    }
  }

  dashboard.has_transactions = hasTransactions;
  dashboard.latest_transaction_month = latestTransactionMonth;
  dashboard.month = month;

  return dashboard;
}

// ---------------------------------------------------------------------------
// getHouseholdDashboardForRange
// ---------------------------------------------------------------------------
export async function getHouseholdDashboardForRange(
  ctx: ServiceContext,
  householdId: string,
  fromDate: string | undefined,
  toDate: string | undefined
) {
  // Get household member IDs
  const { data: hhMembers } = await ctx.supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);
  const hhMemberIds = (hhMembers ?? []).map((m: any) => m.id);

  const dashboard = (await computeHouseholdFromTransactionsRange(
    ctx,
    householdId,
    fromDate,
    toDate
  )) as any;

  let hasTransactions = false;
  if (hhMemberIds.length > 0) {
    let countQuery = ctx.supabaseAdmin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .in("user_id", hhMemberIds);
    if (fromDate) countQuery = countQuery.gte("date", fromDate);
    if (toDate) countQuery = countQuery.lte("date", toDate);
    const { count: txnCount } = await countQuery;
    hasTransactions = (txnCount ?? 0) > 0;
  }
  dashboard.has_transactions = hasTransactions;

  if (!hasTransactions) {
    dashboard.latest_transaction_month =
      await findLatestHouseholdTransactionMonth(ctx, householdId);
  }

  const { data: latestReport } = await ctx.supabaseAdmin
    .from("reports")
    .select("ai_insights, report_month")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .not("ai_insights", "is", null)
    .order("report_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestReport?.ai_insights) {
    dashboard.insights = latestReport.ai_insights;
    dashboard.insights_month = latestReport.report_month;
  }

  return dashboard;
}
