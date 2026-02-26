/**
 * PDF layout test script — generates PDFs with various mock data scenarios
 * to visually verify the dynamic layout behavior.
 *
 * Usage: bun run packages/api/scripts/test-pdf-layout.ts [scenario-number]
 * Output: packages/api/scripts/pdf-output/scenario-{N}.pdf
 */
import { buildReportPdf } from "../src/services/pdf-report.service";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const outDir = join(__dirname, "pdf-output");
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------
function makeBills(count: number) {
  const names = [
    "Netflix", "Spotify", "Rent", "Electric Bill", "Water Bill",
    "Internet", "Phone", "Car Insurance", "Health Insurance", "Gym",
    "Cloud Storage", "Amazon Prime", "Hulu", "Disney+", "YouTube Premium",
  ];
  return Array.from({ length: count }, (_, i) => ({
    description: `bill-${i}`,
    friendly_name: names[i % names.length],
    amount: 10 + Math.round(Math.random() * 200),
    recurrence_interval: ["monthly", "quarterly", "yearly"][i % 3],
    next_due_date: "2026-03-15",
  }));
}

function makeIncome(count: number) {
  const sources = ["Salary", "Freelance", "Dividends", "Rental Income", "Side Gig", "Consulting"];
  return Array.from({ length: count }, (_, i) => ({
    source_name: sources[i % sources.length],
    amount: 1000 + Math.round(Math.random() * 5000),
    frequency: ["monthly", "bi-weekly", "weekly"][i % 3],
    attributed_to_name: i % 3 === 0 ? null : `Member ${i}`,
  }));
}

function makeSubscriptions(count: number) {
  const names = [
    "Netflix", "Spotify", "ChatGPT Plus", "iCloud", "Notion",
    "Figma", "GitHub Pro", "Dropbox", "Adobe CC", "Slack",
    "Zoom", "1Password", "NordVPN", "Grammarly", "Canva",
  ];
  const cats = ["Entertainment", "Productivity", "Cloud", "Design", "Security"];
  return Array.from({ length: count }, (_, i) => ({
    name: names[i % names.length],
    amount: 5 + Math.round(Math.random() * 30),
    category: cats[i % cats.length],
    recurrence_interval: "monthly",
  }));
}

function makeGoals(count: number) {
  const goals = [
    { name: "Emergency Fund", type: "savings", cat: null },
    { name: "Grocery Budget", type: "budget", cat: "Groceries" },
    { name: "Vacation Fund", type: "savings", cat: null },
    { name: "Dining Out Budget", type: "budget", cat: "Dining" },
    { name: "New Car Fund", type: "savings", cat: null },
    { name: "Entertainment Budget", type: "budget", cat: "Entertainment" },
  ];
  return Array.from({ length: count }, (_, i) => {
    const g = goals[i % goals.length];
    const target = 1000 + Math.round(Math.random() * 5000);
    return {
      name: g.name,
      goal_type: g.type,
      current: Math.round(target * (0.2 + Math.random() * 0.9)),
      target,
      category_name: g.cat,
      target_date: "2026-12-31",
    };
  });
}

function makeSavings(count: number) {
  const cats = ["Dining Out", "Entertainment", "Shopping", "Transportation", "Subscriptions"];
  return Array.from({ length: count }, (_, i) => ({
    category: cats[i % cats.length],
    amount: 50 + Math.round(Math.random() * 300),
    percentage: 5 + Math.round(Math.random() * 20),
    suggestion: `Consider reducing ${cats[i % cats.length].toLowerCase()} spending by reviewing recent transactions and canceling unused services.`,
  }));
}

function makeCategories(count: number) {
  const cats = [
    "Groceries", "Dining Out", "Transportation", "Entertainment",
    "Shopping", "Utilities", "Healthcare", "Education",
    "Personal Care", "Home Improvement", "Travel", "Gifts",
  ];
  const total = 1000 + Math.round(Math.random() * 4000);
  return Array.from({ length: count }, (_, i) => {
    const pct = Math.max(3, Math.round((100 / count) + (Math.random() - 0.5) * 20));
    return {
      category: cats[i % cats.length],
      amount: Math.round(total * pct / 100),
      percentage: pct,
    };
  });
}

function makeMembers(count: number) {
  const names = ["Alice", "Bob", "Carol", "Dave"];
  return Array.from({ length: count }, (_, i) => ({
    display_name: names[i % names.length],
    income: 2000 + Math.round(Math.random() * 5000),
    expenses: 1000 + Math.round(Math.random() * 3000),
  }));
}

function makeReport(cats: ReturnType<typeof makeCategories>) {
  const totalExp = cats.reduce((s, c) => s + c.amount, 0);
  const totalInc = totalExp + 500 + Math.round(Math.random() * 2000);
  return {
    total_income: totalInc,
    total_expenses: totalExp,
    savings_rate: ((totalInc - totalExp) / totalInc) * 100,
    expense_to_income_ratio: totalExp / totalInc,
    by_category: cats,
    top_categories: cats.slice(0, 3).map((c) => c.category),
    month_over_month: { income_change: 5.2, expense_change: -3.1 },
  };
}

// ---------------------------------------------------------------------------
// 10 Scenarios — progressively tests edge cases
// ---------------------------------------------------------------------------
const scenarios: Array<{ label: string; build: () => Parameters<typeof buildReportPdf>[0] }> = [
  {
    label: "1: Very sparse — 2 bills, 1 income, 0 subs, 0 goals",
    build: () => {
      const cats = makeCategories(2);
      return {
        title: "Sparse Household",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "Spending looks light this month.",
        recurringBills: makeBills(2),
        incomeSources: makeIncome(1),
        subscriptionsPaid: [],
        goalProgress: [],
        savingsRecommendations: [],
      };
    },
  },
  {
    label: "2: Dense — 12 bills, 6 income, 10 subs, 5 goals, 4 savings, 3 members",
    build: () => {
      const cats = makeCategories(10);
      return {
        title: "Dense Household",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "This was a high-spending month with significant expenses across multiple categories. Consider reviewing entertainment and dining out budgets for next month. Your savings rate has decreased compared to the previous period.",
        recurringBills: makeBills(12),
        incomeSources: makeIncome(6),
        memberContributions: makeMembers(3),
        subscriptionsPaid: makeSubscriptions(10),
        goalProgress: makeGoals(5),
        savingsRecommendations: makeSavings(4),
      };
    },
  },
  {
    label: "3: Only expenses — 8 categories, 5 bills, no income/subs/goals",
    build: () => {
      const cats = makeCategories(8);
      return {
        title: "Expense-Only User",
        month: "January 2026",
        reportData: { ...makeReport(cats), total_income: 0, savings_rate: 0, expense_to_income_ratio: Infinity, month_over_month: null },
        aiInsights: null,
        recurringBills: makeBills(5),
        incomeSources: [],
        subscriptionsPaid: [],
        goalProgress: [],
        savingsRecommendations: [],
      };
    },
  },
  {
    label: "4: Many categories (12) + many goals (6) — bar chart and goal overflow",
    build: () => {
      const cats = makeCategories(12);
      return {
        title: "Category-Heavy User",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "A diverse spending profile across 12 categories.",
        recurringBills: makeBills(3),
        incomeSources: makeIncome(2),
        subscriptionsPaid: makeSubscriptions(3),
        goalProgress: makeGoals(6),
        savingsRecommendations: makeSavings(2),
      };
    },
  },
  {
    label: "5: Long AI insights + medium tables",
    build: () => {
      const cats = makeCategories(5);
      return {
        title: "Insights-Heavy Report",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "Your financial health this month shows some positive trends. Income increased by 5.2% while expenses decreased by 3.1%. However, there are areas for improvement. Your dining out category represents 28% of total spending, which is significantly higher than the recommended 15%. Consider meal prepping to reduce costs. Your emergency fund is on track, reaching 65% of your target with 7 months remaining. The subscription audit revealed 3 services with overlapping functionality — consolidating these could save approximately $45/month. Overall, maintain current savings discipline while focusing on the identified spending categories for optimization.",
        recurringBills: makeBills(6),
        incomeSources: makeIncome(3),
        subscriptionsPaid: makeSubscriptions(5),
        goalProgress: makeGoals(3),
        savingsRecommendations: makeSavings(3),
      };
    },
  },
  {
    label: "6: Single item per section — minimal content everywhere",
    build: () => {
      const cats = makeCategories(1);
      return {
        title: "Minimalist User",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "Very simple finances this month.",
        recurringBills: makeBills(1),
        incomeSources: makeIncome(1),
        subscriptionsPaid: makeSubscriptions(1),
        goalProgress: makeGoals(1),
        savingsRecommendations: makeSavings(1),
        memberContributions: makeMembers(1),
      };
    },
  },
  {
    label: "7: Only savings recommendations (5) + members (4) — tests page 4 section alone",
    build: () => {
      const cats = makeCategories(3);
      return {
        title: "Savings-Focused Report",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "Focus on savings this month.",
        recurringBills: [],
        incomeSources: [],
        subscriptionsPaid: [],
        goalProgress: [],
        savingsRecommendations: makeSavings(5),
        memberContributions: makeMembers(4),
      };
    },
  },
  {
    label: "8: 15 bills + 15 subscriptions — large tables spanning pages",
    build: () => {
      const cats = makeCategories(6);
      return {
        title: "Heavy Bills Household",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "Numerous recurring obligations this month.",
        recurringBills: makeBills(15),
        incomeSources: makeIncome(4),
        subscriptionsPaid: makeSubscriptions(15),
        goalProgress: makeGoals(2),
        savingsRecommendations: makeSavings(1),
      };
    },
  },
  {
    label: "9: No AI insights, 3 bills, 2 income, 8 subs — tests flow without insights box",
    build: () => {
      const cats = makeCategories(4);
      return {
        title: "No-Insights User",
        month: "January 2026",
        reportData: { ...makeReport(cats), month_over_month: null },
        aiInsights: null,
        recurringBills: makeBills(3),
        incomeSources: makeIncome(2),
        subscriptionsPaid: makeSubscriptions(8),
        goalProgress: makeGoals(4),
        savingsRecommendations: [],
      };
    },
  },
  {
    label: "10: Everything maxed — 15 bills, 6 income, 15 subs, 6 goals, 5 savings, 4 members",
    build: () => {
      const cats = makeCategories(12);
      return {
        title: "Maximum Data Household",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "This comprehensive report covers all household members and financial categories. Income is diversified across multiple sources with a healthy savings rate. Several budget goals need attention as spending has exceeded targets in entertainment and dining categories. Subscription costs continue to grow and should be reviewed quarterly.",
        recurringBills: makeBills(15),
        incomeSources: makeIncome(6),
        memberContributions: makeMembers(4),
        subscriptionsPaid: makeSubscriptions(15),
        goalProgress: makeGoals(6),
        savingsRecommendations: makeSavings(5),
      };
    },
  },
  // --- Round 2: Edge-case scenarios ---
  {
    label: "11: Giant AI insights — fills most of page 1, pushes sections down",
    build: () => {
      const cats = makeCategories(4);
      const longInsights = [
        "Your financial health this month shows several important trends worth discussing in detail.",
        "Income has increased by 5.2% compared to last month, driven primarily by freelance earnings.",
        "However, expenses also rose by 8.3%, mainly in the dining out and entertainment categories.",
        "Your grocery spending remained stable at $450, which is well within the recommended range.",
        "Transportation costs dropped 12% thanks to working from home more frequently.",
        "The subscription audit revealed that you are currently paying for 8 active subscriptions,",
        "three of which have overlapping functionality. Consolidating these could save approximately",
        "$45 per month. Your emergency fund has reached 65% of its target with 7 months remaining",
        "before the deadline. At the current savings rate, you should reach your goal on time.",
        "Healthcare expenses were higher than usual due to an annual checkup and dental visit.",
        "Consider setting aside a monthly health savings amount to smooth out these periodic costs.",
        "Overall, maintain your current savings discipline while focusing on the identified areas.",
      ].join(" ");
      return {
        title: "Insights-Heavy Report",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: longInsights,
        recurringBills: makeBills(4),
        incomeSources: makeIncome(2),
        subscriptionsPaid: makeSubscriptions(3),
        goalProgress: makeGoals(2),
        savingsRecommendations: [],
      };
    },
  },
  {
    label: "12: Long wrapping names in table cells",
    build: () => {
      const cats = makeCategories(3);
      const bills = [
        { description: "x", friendly_name: "Monthly Premium Health Insurance Plan (Family Coverage - Gold Tier)", amount: 450, recurrence_interval: "monthly", next_due_date: "2026-03-01" },
        { description: "x", friendly_name: "Consolidated Edison Electric & Gas Service", amount: 185, recurrence_interval: "monthly", next_due_date: "2026-03-15" },
        { description: "x", friendly_name: "AT&T Fiber Internet + TV Bundle with HBO Max", amount: 129, recurrence_interval: "monthly", next_due_date: "2026-03-10" },
        { description: "x", friendly_name: "Progressive Auto Insurance (2 vehicles, comprehensive)", amount: 280, recurrence_interval: "quarterly", next_due_date: "2026-04-01" },
        { description: "x", friendly_name: "Rent", amount: 2100, recurrence_interval: "monthly", next_due_date: "2026-03-01" },
      ];
      return {
        title: "Long Names Stress Test",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "Testing long text wrapping in table cells.",
        recurringBills: bills,
        incomeSources: makeIncome(2),
        subscriptionsPaid: makeSubscriptions(4),
        goalProgress: makeGoals(2),
        savingsRecommendations: makeSavings(1),
      };
    },
  },
  {
    label: "13: Only goals (6) + no tables — tests goal progress overflow",
    build: () => {
      const cats = makeCategories(2);
      return {
        title: "Goals-Only User",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "Focus is entirely on hitting budget and savings goals.",
        recurringBills: [],
        incomeSources: [],
        subscriptionsPaid: [],
        goalProgress: makeGoals(6),
        savingsRecommendations: [],
      };
    },
  },
  {
    label: "14: 7 bills + 4 income — content near page boundary",
    build: () => {
      const cats = makeCategories(6);
      return {
        title: "Boundary Test Household",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "Testing content that lands right at page boundaries.",
        recurringBills: makeBills(7),
        incomeSources: makeIncome(4),
        subscriptionsPaid: makeSubscriptions(6),
        goalProgress: makeGoals(3),
        savingsRecommendations: makeSavings(2),
        memberContributions: makeMembers(2),
      };
    },
  },
  {
    label: "15: 2 bills + 15 subs — small first table, large second table",
    build: () => {
      const cats = makeCategories(3);
      return {
        title: "Subscription-Heavy User",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "You have a lot of subscriptions relative to other bills.",
        recurringBills: makeBills(2),
        incomeSources: makeIncome(1),
        subscriptionsPaid: makeSubscriptions(15),
        goalProgress: makeGoals(1),
        savingsRecommendations: makeSavings(3),
      };
    },
  },
  // --- Round 3: Extreme stress tests ---
  {
    label: "16: 15 categories — bar chart forces page overflow before total",
    build: () => {
      const cats = makeCategories(15);
      return {
        title: "Many Categories User",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "Testing bar chart with 15 categories to force the Total row near a page break.",
        recurringBills: makeBills(3),
        incomeSources: makeIncome(2),
        subscriptionsPaid: [],
        goalProgress: [],
        savingsRecommendations: [],
      };
    },
  },
  {
    label: "17: Every section has exactly 4-5 items — mid-size across the board",
    build: () => {
      const cats = makeCategories(5);
      return {
        title: "Balanced Household",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "A well-balanced financial profile with moderate data in each section.",
        recurringBills: makeBills(5),
        incomeSources: makeIncome(4),
        subscriptionsPaid: makeSubscriptions(5),
        goalProgress: makeGoals(4),
        savingsRecommendations: makeSavings(3),
        memberContributions: makeMembers(3),
      };
    },
  },
  {
    label: "18: No bar chart, no insights — tests flow starting directly with bills",
    build: () => {
      return {
        title: "Minimal Data User",
        month: "January 2026",
        reportData: {
          total_income: 3000,
          total_expenses: 2000,
          savings_rate: 33.3,
          expense_to_income_ratio: 0.67,
          by_category: [],
          top_categories: [],
          month_over_month: null,
        },
        aiInsights: null,
        recurringBills: makeBills(4),
        incomeSources: makeIncome(2),
        subscriptionsPaid: makeSubscriptions(3),
        goalProgress: makeGoals(2),
        savingsRecommendations: makeSavings(2),
        memberContributions: makeMembers(2),
      };
    },
  },
  {
    label: "19: 10 goals + 5 savings — tests goal/savings sections spanning pages",
    build: () => {
      const cats = makeCategories(3);
      return {
        title: "Goals-Heavy Household",
        month: "January 2026",
        reportData: makeReport(cats),
        aiInsights: "Multiple financial goals being tracked simultaneously.",
        recurringBills: makeBills(2),
        incomeSources: makeIncome(1),
        subscriptionsPaid: makeSubscriptions(2),
        goalProgress: makeGoals(10),
        savingsRecommendations: makeSavings(5),
        memberContributions: makeMembers(2),
      };
    },
  },
  {
    label: "20: Empty everything except header and metrics",
    build: () => {
      return {
        title: "Brand New User",
        month: "January 2026",
        reportData: {
          total_income: 0,
          total_expenses: 0,
          savings_rate: 0,
          expense_to_income_ratio: 0,
          by_category: [],
          top_categories: [],
          month_over_month: null,
        },
        aiInsights: null,
        recurringBills: [],
        incomeSources: [],
        subscriptionsPaid: [],
        goalProgress: [],
        savingsRecommendations: [],
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const which = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  const toRun = which ? [scenarios[which - 1]] : scenarios;

  for (const scenario of toRun) {
    const idx = scenarios.indexOf(scenario) + 1;
    console.log(`Generating scenario ${idx}: ${scenario.label}`);
    const input = scenario.build();
    const buf = await buildReportPdf(input);
    const outPath = join(outDir, `scenario-${idx}.pdf`);
    writeFileSync(outPath, buf);
    console.log(`  -> ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
