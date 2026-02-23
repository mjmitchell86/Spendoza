import { supabaseAdmin } from "../lib/supabase";
import { extractTextFromPDF, extractTransactions } from "../ai/pdf-parser";
import { classifyTransactions } from "../ai/transaction-classifier";
import { matchTransactions } from "../ai/expense-matcher";

/** Wraps a promise with a timeout so it fails gracefully instead of being killed by Vercel. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

/**
 * Processes a bank statement through the AI pipeline:
 *
 * 1. Downloads PDF from Supabase Storage
 * 2. Extracts text from PDF
 * 3. Uses AI to extract structured transactions
 * 4. Classifies transactions into user categories
 * 5. Matches transactions against existing expenses/income
 * 6. Inserts parsed transactions into the database
 * 7. Updates statement status to "parsed"
 */
export async function processBankStatement(
  statementId: string
): Promise<void> {
  const log = (step: string, detail?: string) =>
    console.log(`[ai-pipeline] [${statementId}] ${step}${detail ? `: ${detail}` : ""}`);

  // Helper to persist progress to DB (Vercel logs from waitUntil are not captured)
  const updateProgress = async (step: string) => {
    await supabaseAdmin
      .from("bank_statements")
      .update({ parsed_data: { pipeline_step: step, updated_at: new Date().toISOString() } })
      .eq("id", statementId);
  };

  try {
    // 1. Update status to "processing"
    log("step 1", "setting status to processing");
    await supabaseAdmin
      .from("bank_statements")
      .update({ status: "processing" })
      .eq("id", statementId);
    await updateProgress("step 1: status set to processing");

    // 2. Fetch the statement record
    log("step 2", "fetching statement record");
    const { data: statement, error: stmtError } = await supabaseAdmin
      .from("bank_statements")
      .select("*")
      .eq("id", statementId)
      .single();

    if (stmtError || !statement) {
      throw new Error(`Statement not found: ${statementId}`);
    }

    const { file_path, user_id, bank_name } = statement;
    log("step 2", `found statement, file_path=${file_path}`);
    await updateProgress("step 2: fetched statement record");

    // 3. Download PDF from Supabase Storage
    log("step 3", "downloading PDF from storage");
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("bank-statements")
      .download(file_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download PDF: ${downloadError?.message}`);
    }

    // Convert Blob to Buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    log("step 3", `downloaded PDF, size=${pdfBuffer.length} bytes`);
    await updateProgress(`step 3: downloaded PDF (${pdfBuffer.length} bytes)`);

    // 4. Extract text from PDF
    log("step 4", "extracting text from PDF");
    const pdfText = await extractTextFromPDF(pdfBuffer);
    log("step 4", `extracted ${pdfText.length} chars of text`);
    await updateProgress(`step 4: extracted ${pdfText.length} chars of text`);

    if (!pdfText.trim()) {
      throw new Error("No text could be extracted from the PDF");
    }

    // 5. Extract transactions from text using AI
    log("step 5", "extracting transactions via AI");
    await updateProgress("step 5: calling OpenAI for transaction extraction...");
    const parsedTransactions = await withTimeout(
      extractTransactions(pdfText, bank_name ?? undefined),
      45_000,
      "OpenAI transaction extraction"
    );
    log("step 5", `extracted ${parsedTransactions.length} transactions`);
    await updateProgress(`step 5: extracted ${parsedTransactions.length} transactions`);

    if (parsedTransactions.length === 0) {
      // Update with zero transactions — still considered "parsed"
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
      log("complete", "0 transactions, status set to parsed");
      return;
    }

    // 6. Fetch user's categories from DB
    log("step 6", "fetching user categories");
    const { data: categories } = await supabaseAdmin
      .from("categories")
      .select("name")
      .eq("user_id", user_id);

    const categoryNames = (categories ?? []).map(
      (c: { name: string }) => c.name
    );
    log("step 6", `found ${categoryNames.length} categories`);

    // 7. Classify transactions with AI
    log("step 7", "classifying transactions via AI");
    await updateProgress("step 7: calling OpenAI for classification...");
    const classifiedTransactions = await withTimeout(
      classifyTransactions(parsedTransactions, categoryNames),
      45_000,
      "OpenAI transaction classification"
    );
    log("step 7", `classified ${classifiedTransactions.length} transactions`);

    // 8. Fetch user's existing expenses and income for matching
    log("step 8", "fetching existing expenses/income for matching");
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
    log("step 8", `found ${expenses?.length ?? 0} expenses, ${income?.length ?? 0} income entries`);

    // 9. Match transactions against existing records
    log("step 9", "matching transactions");
    await updateProgress("step 9: calling OpenAI for matching...");
    const matchedTransactions = await withTimeout(
      matchTransactions(classifiedTransactions, expenses ?? [], income ?? []),
      45_000,
      "OpenAI transaction matching"
    );
    log("step 9", `matched ${matchedTransactions.length} transactions`);

    // 10. Insert all transactions into the transactions table
    log("step 10", "inserting transactions into DB");
    const transactionRows = matchedTransactions.map((t) => ({
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
      throw new Error(
        `Failed to insert transactions: ${insertError.message}`
      );
    }
    log("step 10", `inserted ${transactionRows.length} transactions`);

    // 11. Update bank_statements: status = "parsed", parsed_data = summary
    const totalCredits = matchedTransactions
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDebits = matchedTransactions
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0);

    await supabaseAdmin
      .from("bank_statements")
      .update({
        status: "parsed",
        parsed_data: {
          transaction_count: matchedTransactions.length,
          total_credits: totalCredits,
          total_debits: totalDebits,
        },
      })
      .eq("id", statementId);

    log("complete", `parsed ${matchedTransactions.length} txns, credits=$${totalCredits}, debits=$${totalDebits}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ai-pipeline] [${statementId}] FAILED:`, error);
    await supabaseAdmin
      .from("bank_statements")
      .update({
        status: "failed",
        parsed_data: { error: errorMessage, failed_at: new Date().toISOString() },
      })
      .eq("id", statementId);
  }
}
