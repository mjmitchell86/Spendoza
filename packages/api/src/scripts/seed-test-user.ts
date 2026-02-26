/**
 * Seed script: creates a test user with 6 months of realistic bank data.
 *
 * Usage:
 *   bun --env-file=.env src/scripts/seed-test-user.ts
 */

import { supabaseAdmin } from "../lib/supabase";
import { generateUserReport } from "../services/report.service";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TEST_EMAIL = "testuser@spendoza.test";
const TEST_PASSWORD = "TestPass123!";
const DISPLAY_NAME = "Test User";

const BANKS: { name: string; months: [number, number] }[] = [
  { name: "Chase", months: [5, 4] }, // M-6, M-5
  { name: "Bank of America", months: [3, 2] }, // M-4, M-3
  { name: "Discover", months: [1, 0] }, // M-2, M-1
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthDate(monthsAgo: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function randomDay(month: Date): Date {
  const day = 1 + Math.floor(Math.random() * daysInMonth(month));
  return new Date(month.getFullYear(), month.getMonth(), day);
}

function vary(base: number, pct = 0.1): number {
  const factor = 1 + (Math.random() * 2 - 1) * pct;
  return Math.round(base * factor * 100) / 100;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Transaction generators
// ---------------------------------------------------------------------------

interface RawTx {
  date: Date;
  description: string;
  amount: number;
  type: "credit" | "debit";
  ai_category: string;
}

function generateIncomeTransactions(month: Date): RawTx[] {
  const txs: RawTx[] = [];
  const year = month.getFullYear();
  const m = month.getMonth();

  // Salary — 1st and 15th
  txs.push({
    date: new Date(year, m, 1),
    description: "DIRECT DEPOSIT - ACME CORP PAYROLL",
    amount: vary(2250, 0.02),
    type: "credit",
    ai_category: "Income",
  });
  txs.push({
    date: new Date(year, m, 15),
    description: "DIRECT DEPOSIT - ACME CORP PAYROLL",
    amount: vary(2250, 0.02),
    type: "credit",
    ai_category: "Income",
  });

  // Freelance (70% chance)
  if (Math.random() < 0.7) {
    txs.push({
      date: randomDay(month),
      description: pick([
        "VENMO PAYMENT - FREELANCE WEB DEV",
        "PAYPAL TRANSFER - DESIGN WORK",
        "ZELLE FROM CLIENT - CONSULTING",
      ]),
      amount: vary(650, 0.2),
      type: "credit",
      ai_category: "Income",
    });
  }

  // Refund / cashback (40% chance)
  if (Math.random() < 0.4) {
    txs.push({
      date: randomDay(month),
      description: pick([
        "AMAZON REFUND",
        "CASHBACK REWARD DEPOSIT",
        "TARGET RETURN REFUND",
      ]),
      amount: vary(35, 0.3),
      type: "credit",
      ai_category: "Income",
    });
  }

  return txs;
}

function generateExpenseTransactions(month: Date): RawTx[] {
  const txs: RawTx[] = [];
  const year = month.getFullYear();
  const m = month.getMonth();

  // Housing — rent on the 1st
  txs.push({
    date: new Date(year, m, 1),
    description: "ONLINE PMT - GREYSTAR PROPERTY MGMT",
    amount: vary(1800, 0.0),
    type: "debit",
    ai_category: "Housing",
  });

  // Utilities
  txs.push({
    date: new Date(year, m, pick([5, 6, 7])),
    description: "DUKE ENERGY - ELECTRIC BILL",
    amount: vary(150, 0.15),
    type: "debit",
    ai_category: "Utilities",
  });
  txs.push({
    date: new Date(year, m, pick([8, 9, 10])),
    description: "CITY WATER SERVICES",
    amount: vary(50, 0.15),
    type: "debit",
    ai_category: "Utilities",
  });
  txs.push({
    date: new Date(year, m, pick([10, 11, 12])),
    description: "SPECTRUM INTERNET",
    amount: 79.99,
    type: "debit",
    ai_category: "Utilities",
  });

  // Groceries — 4-6 transactions
  const groceryCount = 4 + Math.floor(Math.random() * 3);
  const groceryMerchants = [
    "COSTCO WHOLESALE",
    "KROGER #1234",
    "WHOLE FOODS MARKET",
    "TRADER JOES",
    "ALDI",
    "PUBLIX SUPER MARKETS",
  ];
  for (let i = 0; i < groceryCount; i++) {
    txs.push({
      date: randomDay(month),
      description: pick(groceryMerchants),
      amount: vary(pick([65, 85, 120, 150, 180]), 0.15),
      type: "debit",
      ai_category: "Groceries",
    });
  }

  // Transportation — gas 2-3x, insurance monthly
  const gasCount = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < gasCount; i++) {
    txs.push({
      date: randomDay(month),
      description: pick([
        "SHELL OIL",
        "BP #4567",
        "EXXONMOBIL",
        "CHEVRON",
        "COSTCO GAS",
      ]),
      amount: vary(55, 0.2),
      type: "debit",
      ai_category: "Transportation",
    });
  }
  txs.push({
    date: new Date(year, m, 20),
    description: "GEICO AUTO INSURANCE",
    amount: vary(150, 0.05),
    type: "debit",
    ai_category: "Insurance",
  });

  // Dining out — 3-5 transactions
  const diningCount = 3 + Math.floor(Math.random() * 3);
  const diningMerchants = [
    "CHIPOTLE MEXICAN GRILL",
    "STARBUCKS",
    "OLIVE GARDEN",
    "CHICK-FIL-A",
    "DOMINOS PIZZA",
    "PANERA BREAD",
    "TACO BELL",
    "CHEESECAKE FACTORY",
    "LOCAL BISTRO",
  ];
  for (let i = 0; i < diningCount; i++) {
    txs.push({
      date: randomDay(month),
      description: pick(diningMerchants),
      amount: vary(pick([15, 25, 40, 55, 75]), 0.15),
      type: "debit",
      ai_category: "Dining Out",
    });
  }

  // Subscriptions
  txs.push({
    date: new Date(year, m, pick([3, 4, 5])),
    description: "NETFLIX.COM",
    amount: 15.49,
    type: "debit",
    ai_category: "Subscriptions",
  });
  txs.push({
    date: new Date(year, m, pick([6, 7, 8])),
    description: "SPOTIFY USA",
    amount: 10.99,
    type: "debit",
    ai_category: "Subscriptions",
  });
  txs.push({
    date: new Date(year, m, pick([1, 2, 3])),
    description: "PLANET FITNESS",
    amount: 44.99,
    type: "debit",
    ai_category: "Subscriptions",
  });

  // Healthcare (60% chance)
  if (Math.random() < 0.6) {
    txs.push({
      date: randomDay(month),
      description: pick([
        "CVS PHARMACY",
        "WALGREENS",
        "DR SMITH MEDICAL",
        "QUEST DIAGNOSTICS",
      ]),
      amount: vary(pick([30, 60, 100, 150]), 0.15),
      type: "debit",
      ai_category: "Healthcare",
    });
  }

  // Entertainment (50% chance, 1-2 txns)
  const entCount = Math.random() < 0.5 ? 1 + Math.floor(Math.random() * 2) : 0;
  for (let i = 0; i < entCount; i++) {
    txs.push({
      date: randomDay(month),
      description: pick([
        "AMC THEATRES",
        "STEAM GAMES",
        "TICKETMASTER",
        "BOWLING ALLEY",
        "DAVE AND BUSTERS",
      ]),
      amount: vary(pick([20, 40, 60, 80]), 0.15),
      type: "debit",
      ai_category: "Entertainment",
    });
  }

  // Personal / Amazon — 1-3 transactions
  const amazonCount = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < amazonCount; i++) {
    txs.push({
      date: randomDay(month),
      description: pick([
        "AMAZON.COM",
        "AMZN MKTP US",
        "TARGET.COM",
        "WALMART.COM",
      ]),
      amount: vary(pick([25, 50, 80, 120, 150]), 0.15),
      type: "debit",
      ai_category: "Personal",
    });
  }

  // Insurance — health/life
  txs.push({
    date: new Date(year, m, 15),
    description: "BLUE CROSS BLUE SHIELD - PREMIUM",
    amount: vary(200, 0.05),
    type: "debit",
    ai_category: "Insurance",
  });

  return txs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Spendoza Test User Seed ===\n");

  // --------------------------------------------------
  // Step 1: Create auth user
  // --------------------------------------------------
  console.log("Step 1: Creating auth user...");

  // Delete existing test user if present
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existing = existingUsers?.users?.find((u) => u.email === TEST_EMAIL);
  if (existing) {
    console.log("  Found existing test user, deleting...");
    await supabaseAdmin.auth.admin.deleteUser(existing.id);
    // Wait briefly for cascade deletes
    await new Promise((r) => setTimeout(r, 2000));
  }

  const { data: authData, error: authErr } =
    await supabaseAdmin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: DISPLAY_NAME },
    });

  if (authErr || !authData.user) {
    throw new Error(`Failed to create user: ${authErr?.message}`);
  }

  const userId = authData.user.id;
  console.log(`  User created: ${userId}`);

  // Wait for DB triggers (profile + categories)
  await new Promise((r) => setTimeout(r, 1500));

  // --------------------------------------------------
  // Step 2: Mark onboarding complete
  // --------------------------------------------------
  console.log("Step 2: Marking onboarding complete...");
  const { error: profileErr } = await supabaseAdmin
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", userId);

  if (profileErr) throw new Error(`Profile update failed: ${profileErr.message}`);

  // --------------------------------------------------
  // Step 3: Fetch default categories
  // --------------------------------------------------
  console.log("Step 3: Fetching default categories...");
  const { data: categories, error: catErr } = await supabaseAdmin
    .from("categories")
    .select("id, name")
    .eq("user_id", userId);

  if (catErr || !categories?.length) {
    throw new Error(`Failed to fetch categories: ${catErr?.message}`);
  }

  const catByName = new Map(categories.map((c) => [c.name, c.id]));
  console.log(`  Found ${categories.length} categories`);

  // --------------------------------------------------
  // Step 4-5: Insert bank statements + transactions
  // --------------------------------------------------
  console.log("Step 4-5: Seeding bank statements and transactions...");

  let totalTxCount = 0;
  const statementIds: { id: string; monthsAgo: number }[] = [];

  for (const bank of BANKS) {
    for (const monthsAgo of bank.months) {
      const month = monthDate(monthsAgo);
      const monthStr = fmtMonth(month);
      console.log(`  ${bank.name} — ${monthStr}...`);

      // Insert bank statement
      const { data: stmt, error: stmtErr } = await supabaseAdmin
        .from("bank_statements")
        .insert({
          user_id: userId,
          file_path: `mock/${bank.name.toLowerCase().replace(/ /g, "-")}/${monthStr}.pdf`,
          file_hash: `mock-${bank.name.toLowerCase().replace(/ /g, "-")}-${monthStr}`,
          bank_name: bank.name,
          statement_month: toDateStr(month),
          status: "parsed",
        })
        .select("id")
        .single();

      if (stmtErr || !stmt) {
        throw new Error(`Statement insert failed: ${stmtErr?.message}`);
      }

      statementIds.push({ id: stmt.id, monthsAgo });

      // Generate transactions
      const incomeTxs = generateIncomeTransactions(month);
      const expenseTxs = generateExpenseTransactions(month);
      const allTxs = [...incomeTxs, ...expenseTxs];

      const txRows = allTxs.map((tx) => ({
        bank_statement_id: stmt.id,
        user_id: userId,
        date: toDateStr(tx.date),
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        ai_category: tx.ai_category,
      }));

      const { error: txErr } = await supabaseAdmin
        .from("transactions")
        .insert(txRows);

      if (txErr) throw new Error(`Transaction insert failed: ${txErr.message}`);

      const credits = allTxs
        .filter((t) => t.type === "credit")
        .reduce((s, t) => s + t.amount, 0);
      const debits = allTxs
        .filter((t) => t.type === "debit")
        .reduce((s, t) => s + t.amount, 0);

      console.log(
        `    ${allTxs.length} txns  |  income $${credits.toFixed(0)}  |  expenses $${debits.toFixed(0)}`
      );
      totalTxCount += allTxs.length;
    }
  }

  // --------------------------------------------------
  // Step 6: Insert recurring expenses
  // --------------------------------------------------
  console.log("Step 6: Inserting recurring expenses...");

  const latestStatementId = statementIds.find((s) => s.monthsAgo === 0)?.id;
  const now = new Date();
  const nextMonth1st = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStr = toDateStr(nextMonth1st);

  const recurringExpenses = [
    {
      category: "Housing",
      description: "ONLINE PMT - GREYSTAR PROPERTY MGMT",
      amount: 1800,
    },
    {
      category: "Utilities",
      description: "DUKE ENERGY - ELECTRIC BILL",
      amount: 150,
    },
    {
      category: "Utilities",
      description: "CITY WATER SERVICES",
      amount: 50,
    },
    {
      category: "Utilities",
      description: "SPECTRUM INTERNET",
      amount: 79.99,
    },
    {
      category: "Subscriptions",
      description: "NETFLIX.COM",
      amount: 15.49,
    },
    {
      category: "Subscriptions",
      description: "SPOTIFY USA",
      amount: 10.99,
    },
    {
      category: "Subscriptions",
      description: "PLANET FITNESS",
      amount: 44.99,
    },
    {
      category: "Insurance",
      description: "GEICO AUTO INSURANCE",
      amount: 150,
    },
    {
      category: "Insurance",
      description: "BLUE CROSS BLUE SHIELD - PREMIUM",
      amount: 200,
    },
  ];

  for (const exp of recurringExpenses) {
    const categoryId = catByName.get(exp.category);
    if (!categoryId) {
      console.warn(`  WARNING: Category "${exp.category}" not found, skipping`);
      continue;
    }

    const { error } = await supabaseAdmin.from("expenses").insert({
      user_id: userId,
      category_id: categoryId,
      description: exp.description,
      amount: exp.amount,
      frequency: "recurring",
      recurrence_interval: "monthly",
      next_due_date: nextMonthStr,
      auto_detected: true,
      last_seen_at: new Date().toISOString(),
      bank_statement_id: latestStatementId,
    });

    if (error) console.warn(`  WARNING: Expense insert failed: ${error.message}`);
  }

  console.log(`  Inserted ${recurringExpenses.length} recurring expenses`);

  // --------------------------------------------------
  // Step 7: Insert income entries
  // --------------------------------------------------
  console.log("Step 7: Inserting income entries...");

  const { error: incomeErr } = await supabaseAdmin
    .from("income_entries")
    .insert({
      user_id: userId,
      source_name: "ACME CORP PAYROLL",
      amount: 4500,
      frequency: "biweekly",
      effective_date: toDateStr(monthDate(5)),
      bank_statement_id: latestStatementId,
      is_ai_suggested: true,
    });

  if (incomeErr) console.warn(`  WARNING: Income insert failed: ${incomeErr.message}`);
  else console.log("  Inserted salary income entry");

  // --------------------------------------------------
  // Step 8: Generate reports (oldest first)
  // --------------------------------------------------
  console.log("Step 8: Generating reports...");

  // Collect unique months oldest-first
  const allMonthsAgo = BANKS.flatMap((b) => b.months).sort((a, b) => b - a);

  for (const monthsAgo of allMonthsAgo) {
    const month = monthDate(monthsAgo);
    console.log(`  Generating report for ${fmtMonth(month)}...`);
    try {
      await generateUserReport(userId, month, true);
      console.log(`    Done`);
    } catch (err: any) {
      console.warn(`    WARNING: Report generation failed: ${err.message}`);
    }
  }

  // --------------------------------------------------
  // Summary
  // --------------------------------------------------
  console.log("\n=== Seed Complete ===");
  console.log(`  Email:        ${TEST_EMAIL}`);
  console.log(`  Password:     ${TEST_PASSWORD}`);
  console.log(`  User ID:      ${userId}`);
  console.log(`  Statements:   ${statementIds.length}`);
  console.log(`  Transactions: ${totalTxCount}`);
  console.log(`  Reports:      ${allMonthsAgo.length}`);
  console.log(`\nLogin at your local dev server with the credentials above.`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message || err);
  process.exit(1);
});
