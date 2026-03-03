import { supabaseAdmin } from "../lib/supabase";
import { extractTextFromPDF, extractTransactions } from "../ai/pdf-parser";
import {
  classifyTransactions,
  type ClassifiedTransaction,
} from "../ai/transaction-classifier";
import { matchTransactions } from "../ai/expense-matcher";
import { detectRecurringBills } from "./bill-detection.service";
import { detectRecurringIncome } from "./income-detection.service";
import { generateUserReport, generateHouseholdReport } from "./report.service";

/** Normalize a transaction description for dedup comparison. */
function normalizeDescription(desc: string): string {
  return desc.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Delete the raw PDF from Supabase Storage after processing completes. */
async function deleteRawFile(statementId: string, filePath: string): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from("bank-statements")
    .remove([filePath]);

  if (error) {
    console.error(`[ai-pipeline] [${statementId}] failed to delete raw file: ${error.message}`);
  } else {
    console.log(`[ai-pipeline] [${statementId}] deleted raw file: ${filePath}`);
  }
}

/** Wraps a promise with a timeout so it fails gracefully instead of being killed by Vercel. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

const MAX_RETRIES = 2;
const RETRY_DELAYS = [5_000, 20_000];

const STEPS = [
  "extract_text",
  "extract_transactions",
  "classify_transactions",
  "match_and_insert",
] as const;

type PipelineStep = (typeof STEPS)[number];

// ---------------------------------------------------------------------------
// Step dispatcher
// ---------------------------------------------------------------------------

export async function executeStep(statementId: string, step: string): Promise<void> {
  const log = (msg: string) =>
    console.log(`[ai-pipeline] [${statementId}] [${step}] ${msg}`);

  // Apply exponential backoff for retries
  const statement = await getStatement(statementId);
  const retryCount = (statement.parsed_data as any)?.retry_count ?? 0;

  if (retryCount > 0) {
    const delay = RETRY_DELAYS[retryCount - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
    log(`retry ${retryCount}/${MAX_RETRIES}, backing off ${delay / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  log("starting");

  try {
    switch (step as PipelineStep) {
      case "extract_text":
        await stepExtractText(statementId);
        break;
      case "extract_transactions":
        await stepExtractTransactions(statementId);
        break;
      case "classify_transactions":
        await stepClassifyTransactions(statementId);
        break;
      case "match_and_insert":
        await stepMatchAndInsert(statementId);
        break;
      default:
        throw new Error(`Unknown pipeline step: ${step}`);
    }

    log("completed");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ai-pipeline] [${statementId}] [${step}] FAILED:`, error);

    if (retryCount < MAX_RETRIES) {
      // Re-read to preserve intermediate data (pdf_text, raw_transactions, etc.)
      const current = await getStatement(statementId);
      log(`scheduling retry ${retryCount + 1}/${MAX_RETRIES}`);
      await supabaseAdmin
        .from("bank_statements")
        .update({
          parsed_data: {
            ...(current.parsed_data as any),
            pipeline_step: step,
            retry_count: retryCount + 1,
            last_error: errorMessage,
            last_retry_at: new Date().toISOString(),
          },
        })
        .eq("id", statementId);
    } else {
      // All retries exhausted
      await supabaseAdmin
        .from("bank_statements")
        .update({
          status: "failed",
          parsed_data: {
            error: errorMessage,
            failed_at: new Date().toISOString(),
            failed_step: step,
            retry_count: retryCount,
          },
        })
        .eq("id", statementId);
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: read statement record
// ---------------------------------------------------------------------------

async function getStatement(statementId: string) {
  const { data, error } = await supabaseAdmin
    .from("bank_statements")
    .select("*")
    .eq("id", statementId)
    .single();

  if (error || !data) {
    throw new Error(`Statement not found: ${statementId}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Step 1: extract_text — download PDF, extract text, store in parsed_data
// ---------------------------------------------------------------------------

async function stepExtractText(statementId: string): Promise<void> {
  const statement = await getStatement(statementId);
  const { file_path } = statement;

  // Download file from Supabase Storage
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from("bank-statements")
    .download(file_path);

  if (downloadError || !fileData) {
    throw new Error(`Failed to download file: ${downloadError?.message}`);
  }

  const arrayBuffer = await fileData.arrayBuffer();
  let extractedText: string;

  if (statement.file_type === "csv") {
    // CSV: read as UTF-8 text directly
    extractedText = new TextDecoder("utf-8").decode(arrayBuffer);
    console.log(`[ai-pipeline] [${statementId}] read CSV, ${extractedText.length} chars`);
  } else {
    // PDF: use pdf-parse to extract text
    const pdfBuffer = Buffer.from(arrayBuffer);
    console.log(`[ai-pipeline] [${statementId}] downloaded PDF, size=${pdfBuffer.length} bytes`);
    extractedText = await extractTextFromPDF(pdfBuffer);
    console.log(`[ai-pipeline] [${statementId}] extracted ${extractedText.length} chars of text`);
  }

  if (!extractedText.trim()) {
    throw new Error(`No text could be extracted from the ${statement.file_type === "csv" ? "CSV" : "PDF"}`);
  }

  // Store text and advance to next step
  await supabaseAdmin
    .from("bank_statements")
    .update({
      parsed_data: {
        pipeline_step: "extract_transactions",
        pdf_text: extractedText,
      },
    })
    .eq("id", statementId);
}

// ---------------------------------------------------------------------------
// Step 2: extract_transactions — AI call to get structured transactions
// ---------------------------------------------------------------------------

async function stepExtractTransactions(statementId: string): Promise<void> {
  const statement = await getStatement(statementId);
  const pdfText = statement.parsed_data?.pdf_text;

  if (!pdfText) {
    throw new Error("No pdf_text found in parsed_data");
  }

  const { transactions: parsedTransactions, detectedBankName, accountLast4 } = await withTimeout(
    extractTransactions(pdfText, statement.bank_name ?? undefined),
    150_000,
    "OpenAI transaction extraction"
  );

  console.log(`[ai-pipeline] [${statementId}] extracted ${parsedTransactions.length} transactions, detected bank: ${detectedBankName ?? "none"}, account last4: ${accountLast4 ?? "none"}`);

  // Determine the best bank_name: user-provided takes priority, then AI-detected
  const baseBankName = statement.bank_name ?? detectedBankName;
  const finalBankName = baseBankName && accountLast4
    ? `${baseBankName}-${accountLast4}`
    : baseBankName;

  if (finalBankName && finalBankName !== statement.bank_name) {
    await supabaseAdmin
      .from("bank_statements")
      .update({ bank_name: finalBankName })
      .eq("id", statementId);
    console.log(`[ai-pipeline] [${statementId}] set bank_name to: ${finalBankName}`);
  }

  if (parsedTransactions.length === 0) {
    // Fallback: if statement_month is still null, use current month
    if (!statement.statement_month) {
      const fallbackMonth = new Date().toISOString().slice(0, 7) + "-01";
      await supabaseAdmin
        .from("bank_statements")
        .update({ statement_month: fallbackMonth })
        .eq("id", statementId);
      console.log(`[ai-pipeline] [${statementId}] no transactions, fallback statement_month: ${fallbackMonth}`);
    }

    // No transactions — mark as parsed immediately
    await supabaseAdmin
      .from("bank_statements")
      .update({
        status: "parsed",
        parsed_data: {
          transaction_count: 0,
          total_credits: 0,
          total_debits: 0,
        },
      })
      .eq("id", statementId);

    // Clean up raw PDF from storage
    await deleteRawFile(statementId, statement.file_path);
    return;
  }

  // Store raw transactions and advance to classification step
  await supabaseAdmin
    .from("bank_statements")
    .update({
      parsed_data: {
        pipeline_step: "classify_transactions",
        raw_transactions: parsedTransactions,
      },
    })
    .eq("id", statementId);
}

// ---------------------------------------------------------------------------
// Step 3: classify_transactions — AI call to classify into user categories
// ---------------------------------------------------------------------------

async function stepClassifyTransactions(statementId: string): Promise<void> {
  const statement = await getStatement(statementId);
  const rawTransactions = statement.parsed_data?.raw_transactions;

  if (!rawTransactions || rawTransactions.length === 0) {
    throw new Error("No raw_transactions found in parsed_data");
  }

  // Fetch user's categories
  const { data: categories } = await supabaseAdmin
    .from("categories")
    .select("name")
    .eq("user_id", statement.user_id);

  const categoryNames = (categories ?? []).map((c: { name: string }) => c.name);

  let classifiedTransactions: ClassifiedTransaction[];

  if (categoryNames.length === 0) {
    // No user categories — skip AI classification, mark all as Uncategorized
    classifiedTransactions = rawTransactions.map((t: any) => ({
      ...t,
      ai_category: "Uncategorized",
    }));
  } else {
    classifiedTransactions = await withTimeout(
      classifyTransactions(rawTransactions, categoryNames),
      110_000,
      "OpenAI transaction classification"
    );
  }

  console.log(`[ai-pipeline] [${statementId}] classified ${classifiedTransactions.length} transactions`);

  // Store classified transactions and advance to match_and_insert
  await supabaseAdmin
    .from("bank_statements")
    .update({
      parsed_data: {
        pipeline_step: "match_and_insert",
        classified_transactions: classifiedTransactions,
      },
    })
    .eq("id", statementId);
}

// ---------------------------------------------------------------------------
// Step 4: match_and_insert — deterministic matching + DB insert
// ---------------------------------------------------------------------------

async function stepMatchAndInsert(statementId: string): Promise<void> {
  const statement = await getStatement(statementId);
  const classifiedTransactions = statement.parsed_data?.classified_transactions;

  if (!classifiedTransactions || classifiedTransactions.length === 0) {
    throw new Error("No classified_transactions found in parsed_data");
  }

  const { user_id } = statement;

  // Fetch existing expenses and income for matching
  const [{ data: expenses }, { data: income }] = await Promise.all([
    supabaseAdmin
      .from("expenses")
      .select("id, description, amount, category_id")
      .eq("user_id", user_id),
    supabaseAdmin
      .from("income_entries")
      .select("id, source_name, amount")
      .eq("user_id", user_id),
  ]);

  console.log(
    `[ai-pipeline] [${statementId}] found ${expenses?.length ?? 0} expenses, ${income?.length ?? 0} income entries`
  );

  // Match transactions against existing records (deterministic, no AI)
  const matchedTransactions = await matchTransactions(
    classifiedTransactions,
    expenses ?? [],
    income ?? []
  );

  // --- Transaction-level dedup ---
  const dates = matchedTransactions.map((t) => t.date).filter(Boolean);
  let newTransactions = matchedTransactions;
  let skippedCount = 0;

  if (dates.length > 0) {
    const sortedDates = [...dates].sort();
    const minDate = sortedDates[0];
    const maxDate = sortedDates[sortedDates.length - 1];

    const { data: existing } = await supabaseAdmin
      .from("transactions")
      .select("date, description, amount, type")
      .eq("user_id", user_id)
      .gte("date", minDate)
      .lte("date", maxDate);

    if (existing && existing.length > 0) {
      const existingSet = new Set(
        existing.map(
          (t: { date: string; description: string; amount: number; type: string }) =>
            `${t.date}|${normalizeDescription(t.description)}|${t.amount}|${t.type}`
        )
      );

      newTransactions = matchedTransactions.filter((t) => {
        const key = `${t.date}|${normalizeDescription(t.description)}|${t.amount}|${t.type}`;
        return !existingSet.has(key);
      });

      skippedCount = matchedTransactions.length - newTransactions.length;
      if (skippedCount > 0) {
        console.log(`[ai-pipeline] [${statementId}] skipped ${skippedCount} duplicate transactions`);
      }
    }
  }

  // Group transactions by YYYY-MM for multi-month splitting
  const monthGroups = new Map<string, typeof newTransactions>();
  for (const t of newTransactions) {
    const month = t.date ? t.date.slice(0, 7) : "unknown";
    const group = monthGroups.get(month) ?? [];
    group.push(t);
    monthGroups.set(month, group);
  }

  // Assign "unknown" date transactions to the most common month
  const unknownTxns = monthGroups.get("unknown");
  if (unknownTxns && unknownTxns.length > 0) {
    monthGroups.delete("unknown");
    // Find most common month among dated transactions
    let bestMonth = "";
    let bestCount = 0;
    for (const [month, txns] of monthGroups) {
      if (txns.length > bestCount) {
        bestMonth = month;
        bestCount = txns.length;
      }
    }
    if (bestMonth) {
      const group = monthGroups.get(bestMonth) ?? [];
      group.push(...unknownTxns);
      monthGroups.set(bestMonth, group);
    } else {
      // All transactions have no date — use current month
      const fallback = new Date().toISOString().slice(0, 7);
      monthGroups.set(fallback, unknownTxns);
    }
  }

  const sortedMonths = Array.from(monthGroups.keys()).sort();
  const isMultiMonth = sortedMonths.length > 1;

  if (isMultiMonth) {
    // Clean up any previous child records from prior splits (reprocess support)
    const { error: cleanupError } = await supabaseAdmin
      .from("bank_statements")
      .delete()
      .eq("user_id", user_id)
      .like("file_hash", `${statement.file_hash}:%`);

    if (cleanupError) {
      console.error(`[ai-pipeline] [${statementId}] cleanup error: ${cleanupError.message}`);
    }
  }

  if (newTransactions.length === 0) {
    console.log(`[ai-pipeline] [${statementId}] all ${skippedCount} transactions were duplicates, nothing to insert`);

    // Update statement to parsed with summary (no transactions)
    await supabaseAdmin
      .from("bank_statements")
      .update({
        status: "parsed",
        statement_month: statement.statement_month ?? new Date().toISOString().slice(0, 7) + "-01",
        parsed_data: {
          transaction_count: 0,
          skipped_duplicates: skippedCount,
          total_credits: 0,
          total_debits: 0,
        },
      })
      .eq("id", statementId);
  } else if (!isMultiMonth) {
    // Single month — behave exactly as before
    const month = sortedMonths[0];
    const txns = monthGroups.get(month)!;

    const transactionRows = txns.map((t) => ({
      bank_statement_id: statementId,
      user_id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      ai_category: t.ai_category,
      matched_expense_id: t.matched_expense_id,
      matched_income_id: t.matched_income_id,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("transactions")
      .insert(transactionRows);

    if (insertError) {
      throw new Error(`Failed to insert transactions: ${insertError.message}`);
    }

    const totalCredits = txns.filter((t) => t.type === "credit").reduce((sum, t) => sum + t.amount, 0);
    const totalDebits = txns.filter((t) => t.type === "debit").reduce((sum, t) => sum + t.amount, 0);

    await supabaseAdmin
      .from("bank_statements")
      .update({
        status: "parsed",
        statement_month: month + "-01",
        parsed_data: {
          transaction_count: txns.length,
          skipped_duplicates: skippedCount,
          total_credits: totalCredits,
          total_debits: totalDebits,
        },
      })
      .eq("id", statementId);

    console.log(
      `[ai-pipeline] [${statementId}] complete: ${txns.length} new txns (${skippedCount} dupes skipped), credits=$${totalCredits}, debits=$${totalDebits}`
    );
  } else {
    // Multiple months — split into per-month statement records
    console.log(`[ai-pipeline] [${statementId}] splitting into ${sortedMonths.length} monthly statements: ${sortedMonths.join(", ")}`);

    for (let i = 0; i < sortedMonths.length; i++) {
      const month = sortedMonths[i];
      const txns = monthGroups.get(month)!;
      let targetStatementId: string;

      if (i === 0) {
        // First month: assign to the original statement record
        targetStatementId = statementId;

        const totalCredits = txns.filter((t) => t.type === "credit").reduce((sum, t) => sum + t.amount, 0);
        const totalDebits = txns.filter((t) => t.type === "debit").reduce((sum, t) => sum + t.amount, 0);

        await supabaseAdmin
          .from("bank_statements")
          .update({
            status: "parsed",
            statement_month: month + "-01",
            parsed_data: {
              transaction_count: txns.length,
              skipped_duplicates: skippedCount,
              total_credits: totalCredits,
              total_debits: totalDebits,
              split_months: sortedMonths.length,
            },
          })
          .eq("id", statementId);
      } else {
        // Additional months: create child statement records
        const totalCredits = txns.filter((t) => t.type === "credit").reduce((sum, t) => sum + t.amount, 0);
        const totalDebits = txns.filter((t) => t.type === "debit").reduce((sum, t) => sum + t.amount, 0);

        const { data: childStatement, error: childError } = await supabaseAdmin
          .from("bank_statements")
          .insert({
            user_id,
            file_path: statement.file_path,
            file_hash: `${statement.file_hash}:${month}`,
            file_type: statement.file_type,
            bank_name: statement.bank_name,
            is_shared_account: statement.is_shared_account,
            account_label: statement.account_label,
            statement_month: month + "-01",
            status: "parsed",
            parsed_data: {
              transaction_count: txns.length,
              total_credits: totalCredits,
              total_debits: totalDebits,
              source_statement_id: statementId,
            },
          })
          .select("id")
          .single();

        if (childError || !childStatement) {
          throw new Error(`Failed to create child statement for ${month}: ${childError?.message}`);
        }

        targetStatementId = childStatement.id;
        console.log(`[ai-pipeline] [${statementId}] created child statement ${targetStatementId} for ${month} (${txns.length} txns)`);
      }

      // Insert transactions for this month
      const transactionRows = txns.map((t) => ({
        bank_statement_id: targetStatementId,
        user_id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: t.type,
        ai_category: t.ai_category,
        matched_expense_id: t.matched_expense_id,
        matched_income_id: t.matched_income_id,
      }));

      const { error: insertError } = await supabaseAdmin
        .from("transactions")
        .insert(transactionRows);

      if (insertError) {
        throw new Error(`Failed to insert transactions for ${month}: ${insertError.message}`);
      }
    }

    console.log(
      `[ai-pipeline] [${statementId}] split complete: ${newTransactions.length} new txns across ${sortedMonths.length} months (${skippedCount} dupes skipped)`
    );
  }

  // Clean up raw PDF from storage — no longer needed
  await deleteRawFile(statementId, statement.file_path);

  // Detect recurring bills from transaction patterns (non-fatal)
  try {
    await detectRecurringBills(user_id);
  } catch (err) {
    console.error(`[ai-pipeline] [${statementId}] bill detection failed:`, err);
  }

  // Detect recurring income from transaction patterns (non-fatal)
  try {
    await detectRecurringIncome(user_id);
  } catch (err) {
    console.error(`[ai-pipeline] [${statementId}] income detection failed:`, err);
  }

  // Auto-generate reports for every month that had transactions inserted (non-fatal)
  try {
    const monthSet = new Set<string>();
    for (const t of newTransactions) {
      if (t.date) {
        monthSet.add(t.date.slice(0, 7)); // "YYYY-MM"
      }
    }

    if (monthSet.size > 0) {
      const months = Array.from(monthSet).sort();

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("household_id")
        .eq("id", user_id)
        .single();

      for (const ym of months) {
        const reportMonth = new Date(ym + "-01T00:00:00Z");
        console.log(`[ai-pipeline] [${statementId}] generating report for ${ym}`);
        await generateUserReport(user_id, reportMonth, true);

        if (profile?.household_id) {
          console.log(`[ai-pipeline] [${statementId}] generating household report for ${ym}`);
          await generateHouseholdReport(profile.household_id, reportMonth, true);
        }
      }
    }
  } catch (err) {
    console.error(`[ai-pipeline] [${statementId}] report generation failed:`, err);
  }
}
