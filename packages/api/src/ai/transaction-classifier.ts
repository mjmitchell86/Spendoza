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

  const totalBatches = Math.ceil(transactions.length / BATCH_SIZE);
  console.log(
    `[classifier] Classifying ${transactions.length} transaction(s) into ${userCategories.length} categories (${totalBatches} batch(es))`
  );

  const model = new ChatOpenAI({
    modelName: "gpt-5-mini",
    temperature: 0,
    timeout: 60_000,
  });

  const results: ClassifiedTransaction[] = [];

  // Process in batches
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    const batch = transactions.slice(i, i + BATCH_SIZE);

    console.log(
      `[classifier] Processing batch ${batchIndex}/${totalBatches} (${batch.length} transactions)`
    );

    const transactionList = batch
      .map(
        (t, idx) =>
          `${idx + 1}. "${t.description}" — $${t.amount} (${t.type})`
      )
      .join("\n");

    const userPrompt = `Available categories: ${userCategories.join(", ")}

Transactions to classify:
${transactionList}`;

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
        `[classifier] Batch ${batchIndex} response received in ${elapsed}ms`
      );
    } catch (error) {
      console.error(
        `[classifier] OpenAI API call failed for batch ${batchIndex}:`,
        error
      );
      throw new Error(
        `AI classification failed on batch ${batchIndex}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error(
        `[classifier] Failed to parse AI response as JSON for batch ${batchIndex}. Raw response:`,
        content.slice(0, 500)
      );
      throw new Error(
        `AI returned invalid JSON during classification (batch ${batchIndex})`
      );
    }

    const classifications: Array<{
      description: string;
      ai_category: string;
    }> = parsed.classifications ?? [];

    // Build a lookup map from description -> ai_category
    const categoryMap = new Map<string, string>();
    for (const c of classifications) {
      categoryMap.set(c.description.toLowerCase(), c.ai_category);
    }

    let uncategorizedCount = 0;

    // Merge classification results with original transaction data
    for (const transaction of batch) {
      const aiCategory =
        categoryMap.get(transaction.description.toLowerCase()) ??
        "Uncategorized";

      if (aiCategory === "Uncategorized") {
        uncategorizedCount++;
      }

      results.push({
        ...transaction,
        ai_category: aiCategory,
      });
    }

    if (uncategorizedCount > 0) {
      console.warn(
        `[classifier] Batch ${batchIndex}: ${uncategorizedCount} transaction(s) could not be matched to AI classifications`
      );
    }
  }

  console.log(
    `[classifier] Classification complete: ${results.length} transaction(s) classified`
  );
  return results;
}
