import { ChatOpenAI } from "@langchain/openai";
import { PDFParse } from "pdf-parse";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

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
 * Extracts raw text from a PDF buffer using pdf-parse.
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  return result.text;
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
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
  });

  let userPrompt = `Extract all transactions from the following bank statement text:\n\n${pdfText}`;

  if (bankName) {
    userPrompt += `\n\nThis is a ${bankName} bank statement. Use ${bankName}-specific formatting conventions to help parse the data accurately.`;
  }

  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userPrompt),
  ]);

  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  const parsed = JSON.parse(content);

  // Handle both { transactions: [...] } and top-level array formats
  const rawTransactions: any[] = Array.isArray(parsed)
    ? parsed
    : parsed.transactions ?? [];

  // Normalize: ensure amounts are positive
  return rawTransactions.map((t) => ({
    date: t.date,
    description: t.description,
    amount: Math.abs(t.amount),
    type: t.type as "credit" | "debit",
  }));
}
