import { ChatOpenAI } from "@langchain/openai";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Point pdfjs worker to the bundled file (copied by the build script).
// In serverless, __dirname resolves to the function directory where
// pdf.worker.mjs lives alongside the bundled entry point.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
pdfjs.GlobalWorkerOptions.workerSrc = join(__dirname, "pdf.worker.mjs");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positive value
  type: "credit" | "debit";
}

// ---------------------------------------------------------------------------
// PDF text extraction
// ---------------------------------------------------------------------------

/**
 * Extracts raw text from a PDF buffer using pdfjs-dist directly (no worker).
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  console.log(
    `[pdf-parser] Extracting text from PDF (${(pdfBuffer.length / 1024).toFixed(1)} KB)`
  );
  try {
    const data = new Uint8Array(pdfBuffer);
    const doc = await pdfjs.getDocument({ data, useWorkerFetch: false }).promise;

    const textParts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(" ");
      textParts.push(pageText);
    }

    const text = textParts.join("\n");
    console.log(
      `[pdf-parser] Extracted ${text.length} chars from ${doc.numPages} page(s)`
    );
    return text;
  } catch (error) {
    console.error("[pdf-parser] Failed to extract text from PDF:", error);
    throw new Error(
      `PDF text extraction failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ---------------------------------------------------------------------------
// AI-powered transaction extraction
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  transactions: ParsedTransaction[];
  detectedBankName: string | null;
  accountLast4: string | null;
}

const SYSTEM_PROMPT = `You are a financial data extraction assistant. Your job is to extract EVERY individual transaction from bank statement text and identify the bank.

CRITICAL: You MUST extract ALL transactions from the entire document, regardless of date range. Do NOT skip, summarize, or truncate. Every single row/line that represents a transaction must be included in your output. The document may span multiple months — extract them all.

For each transaction, extract:
- date: in YYYY-MM-DD format
- description: the merchant or transaction description
- amount: a positive number (no currency symbols, no commas)
- type: "credit" for deposits/income, "debit" for charges/withdrawals

Also identify the bank or financial institution from the statement text (e.g. "Chase", "Bank of America", "Wells Fargo", "Capital One").

Extract the last 4 digits of the account number. Look for patterns like:
- "Account Number: XXXX-XXXX-1234" or "Account: ****1234"
- "Acct #...1234" or "Account ending in 1234"
- Masked formats like "XXXX1234", "****1234", or "...1234"
If no account number is found, set account_last4 to null.

For CSV files that may not contain explicit bank names: try to infer the bank from column headers (e.g. "Posted Date" is common for Chase, "Reference Number" for Bank of America), transaction description patterns, or any metadata rows at the top of the file.

Respond ONLY with valid JSON in this exact format:
{"bank_name": "...", "account_last4": "1234", "transactions": [{"date": "YYYY-MM-DD", "description": "...", "amount": 0.00, "type": "credit|debit"}]}

If you cannot determine the bank, set bank_name to null.
If you cannot find the account last 4, set account_last4 to null.
If there are no transactions, return: {"bank_name": "...", "account_last4": null, "transactions": []}`;

/**
 * Uses ChatOpenAI to extract structured transaction data from bank statement text.
 * Also detects the bank name from the PDF content.
 */
export async function extractTransactions(
  pdfText: string,
  bankName?: string
): Promise<ExtractionResult> {
  console.log(
    `[pdf-parser] Starting AI transaction extraction (${pdfText.length} chars, bank: ${bankName ?? "unknown"})`
  );

  const text = pdfText;

  const model = new ChatOpenAI({
    modelName: "gpt-5-mini",
    timeout: 150_000,
    modelKwargs: { max_completion_tokens: 16_384 },
  });

  let userPrompt = `Extract EVERY transaction from the following bank statement text. Do not skip any rows — include all dates and all months present in the data:\n\n${text}`;

  if (bankName) {
    userPrompt += `\n\nThis is a ${bankName} bank statement. Use ${bankName}-specific formatting conventions to help parse the data accurately.`;
  }

  let content: string;
  try {
    const startTime = Date.now();
    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);
    const elapsed = Date.now() - startTime;

    content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    console.log(
      `[pdf-parser] AI response received in ${elapsed}ms (${content.length} chars)`
    );
  } catch (error) {
    console.error("[pdf-parser] OpenAI API call failed:", error);
    throw new Error(
      `AI transaction extraction failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error(
      "[pdf-parser] Failed to parse AI response as JSON. Raw response:",
      content.slice(0, 500)
    );
    throw new Error("AI returned invalid JSON during transaction extraction");
  }

  // Handle both { transactions: [...] } and top-level array formats
  const rawTransactions: any[] = Array.isArray(parsed)
    ? parsed
    : parsed.transactions ?? [];

  const detectedBankName: string | null =
    !Array.isArray(parsed) && parsed.bank_name
      ? String(parsed.bank_name)
      : null;

  const accountLast4: string | null =
    !Array.isArray(parsed) && parsed.account_last4
      ? String(parsed.account_last4)
      : null;

  console.log(
    `[pdf-parser] Extracted ${rawTransactions.length} transaction(s), detected bank: ${detectedBankName ?? "none"}, account last4: ${accountLast4 ?? "none"}`
  );

  // Normalize: ensure amounts are positive
  const transactions = rawTransactions.map((t) => ({
    date: t.date,
    description: t.description,
    amount: Math.abs(t.amount),
    type: t.type as "credit" | "debit",
  }));

  return { transactions, detectedBankName, accountLast4 };
}
