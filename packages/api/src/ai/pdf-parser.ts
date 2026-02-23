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

const SYSTEM_PROMPT = `You are a financial data extraction assistant. Your job is to extract individual transactions from bank statement text.

For each transaction, extract:
- date: in YYYY-MM-DD format
- description: the merchant or transaction description
- amount: a positive number (no currency symbols, no commas)
- type: "credit" for deposits/income, "debit" for charges/withdrawals

Respond ONLY with valid JSON in this exact format:
{"transactions": [{"date": "YYYY-MM-DD", "description": "...", "amount": 0.00, "type": "credit|debit"}]}

If there are no transactions, return: {"transactions": []}`;

/**
 * Uses ChatOpenAI to extract structured transaction data from bank statement text.
 */
export async function extractTransactions(
  pdfText: string,
  bankName?: string
): Promise<ParsedTransaction[]> {
  console.log(
    `[pdf-parser] Starting AI transaction extraction (${pdfText.length} chars, bank: ${bankName ?? "unknown"})`
  );

  const text = pdfText;

  const model = new ChatOpenAI({
    modelName: "gpt-5-mini",
    timeout: 110_000,
  });

  let userPrompt = `Extract all transactions from the following bank statement text:\n\n${text}`;

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

  console.log(
    `[pdf-parser] Extracted ${rawTransactions.length} transaction(s) from AI response`
  );

  // Normalize: ensure amounts are positive
  return rawTransactions.map((t) => ({
    date: t.date,
    description: t.description,
    amount: Math.abs(t.amount),
    type: t.type as "credit" | "debit",
  }));
}
