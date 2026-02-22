import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ParsedTransaction } from "./pdf-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ClassifiedTransaction extends ParsedTransaction {
  ai_category: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BATCH_SIZE = 20;

const SYSTEM_PROMPT = `You are a financial transaction classifier. Given a list of transactions and available categories, classify each transaction into the most appropriate category.

Respond ONLY with valid JSON in this exact format:
{"classifications": [{"description": "...", "ai_category": "..."}]}

Rules:
- Use ONLY the provided category names exactly as given
- Every transaction must be classified
- Match based on the merchant/description and transaction type`;

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classifies transactions into user-defined categories using ChatOpenAI.
 * Processes in batches of BATCH_SIZE to avoid token limits.
 */
export async function classifyTransactions(
  transactions: ParsedTransaction[],
  userCategories: string[]
): Promise<ClassifiedTransaction[]> {
  if (transactions.length === 0) {
    return [];
  }

  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
  });

  const results: ClassifiedTransaction[] = [];

  // Process in batches
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);

    const transactionList = batch
      .map(
        (t, idx) =>
          `${idx + 1}. "${t.description}" — $${t.amount} (${t.type})`
      )
      .join("\n");

    const userPrompt = `Available categories: ${userCategories.join(", ")}

Transactions to classify:
${transactionList}`;

    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const parsed = JSON.parse(content);
    const classifications: Array<{
      description: string;
      ai_category: string;
    }> = parsed.classifications ?? [];

    // Build a lookup map from description -> ai_category
    const categoryMap = new Map<string, string>();
    for (const c of classifications) {
      categoryMap.set(c.description.toLowerCase(), c.ai_category);
    }

    // Merge classification results with original transaction data
    for (const transaction of batch) {
      const aiCategory =
        categoryMap.get(transaction.description.toLowerCase()) ??
        "Uncategorized";

      results.push({
        ...transaction,
        ai_category: aiCategory,
      });
    }
  }

  return results;
}
