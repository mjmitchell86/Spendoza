import { supabaseAdmin } from "../lib/supabase";
import { extractTextFromPDF, extractTransactions } from "../ai/pdf-parser";
import { classifyTransactions } from "../ai/transaction-classifier";
import { matchTransactions } from "../ai/expense-matcher";

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
  try {
    // 1. Update status to "processing"
    await supabaseAdmin
      .from("bank_statements")
      .update({ status: "processing" })
      .eq("id", statementId);

    // 2. Fetch the statement record
    const { data: statement, error: stmtError } = await supabaseAdmin
      .from("bank_statements")
      .select("*")
      .eq("id", statementId)
      .single();

    if (stmtError || !statement) {
      throw new Error(`Statement not found: ${statementId}`);
    }

    const { file_path, user_id, bank_name } = statement;

    // 3. Download PDF from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("bank-statements")
      .download(file_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download PDF: ${downloadError?.message}`);
    }

    // Convert Blob to Buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // 4. Extract text from PDF
    const pdfText = await extractTextFromPDF(pdfBuffer);

    if (!pdfText.trim()) {
      throw new Error("No text could be extracted from the PDF");
    }

    // 5. Extract transactions from text using AI
    const parsedTransactions = await extractTransactions(
      pdfText,
      bank_name ?? undefined
    );

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
      return;
    }

    // 6. Fetch user's categories from DB
    const { data: categories } = await supabaseAdmin
      .from("categories")
      .select("name")
      .eq("user_id", user_id);

    const categoryNames = (categories ?? []).map(
      (c: { name: string }) => c.name
    );

    // 7. Classify transactions with AI
    const classifiedTransactions = await classifyTransactions(
      parsedTransactions,
      categoryNames
    );

    // 8. Fetch user's existing expenses and income for matching
    const [{ data: expenses }, { data: income }] = await Promise.all([
      supabaseAdmin
        .from("expenses")
        .select("id, description, amount, category_id")
        .eq("user_id", user_id),
      supabaseAdmin
        .from("income")
        .select("id, source_name, amount")
        .eq("user_id", user_id),
    ]);

    // 9. Match transactions against existing records
    const matchedTransactions = await matchTransactions(
      classifiedTransactions,
      expenses ?? [],
      income ?? []
    );

    // 10. Insert all transactions into the transactions table
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
  } catch (error) {
    // Update bank_statements status to "failed"
    console.error(`Failed to process statement ${statementId}:`, error);
    await supabaseAdmin
      .from("bank_statements")
      .update({ status: "failed" })
      .eq("id", statementId);
  }
}
