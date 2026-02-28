import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ParsedTransaction } from "./pdf-parser";
import { logLlmUsage } from "./llm-usage-logger";

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

const SYSTEM_PROMPT = `You are a financial transaction classifier. Given a numbered list of transactions and available categories, classify each transaction into the most appropriate category.

Respond ONLY with valid JSON in this exact format:
{"classifications": [{"index": 1, "ai_category": "..."}, {"index": 2, "ai_category": "..."}, ...]}

Rules:
- Use ONLY the provided category names exactly as given — do not invent new categories
- Every transaction MUST be classified — use the closest matching category
- The "index" field must match the transaction number from the input list
- Match based on merchant name patterns (e.g. WALMART/TARGET → Groceries, SHELL/EXXON → Gas/Transportation, NETFLIX/SPOTIFY → Entertainment, restaurants/cafes → Dining)
- For ambiguous transactions, prefer the most specific matching category over generic ones
- If no category is a good fit, pick the broadest/most general category available — never leave a transaction unclassified`;

/**
 * Normalize a description for fuzzy matching: lowercase, strip non-alphanumeric.
 */
function normalizeDescription(desc: string): string {
  return desc.toLowerCase().replace(/[^a-z0-9]/g, "");
}

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

      const usage = response.usage_metadata;
      if (usage) {
        void logLlmUsage({
          user_id: null,
          call_type: "categorization",
          model: "gpt-5-mini",
          input_tokens: usage.input_tokens ?? 0,
          output_tokens: usage.output_tokens ?? 0,
          total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
        });
      }
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
      index?: number;
      description?: string;
      ai_category: string;
    }> = parsed.classifications ?? [];

    // Build index-based lookup (1-based index → category)
    const indexMap = new Map<number, string>();
    // Build normalized description lookup as fallback
    const descMap = new Map<string, string>();
    for (const c of classifications) {
      if (c.index != null) {
        indexMap.set(c.index, c.ai_category);
      }
      if (c.description) {
        descMap.set(normalizeDescription(c.description), c.ai_category);
      }
    }

    // Category name lookup for case-insensitive validation
    const categoryLower = new Map(
      userCategories.map((uc) => [uc.toLowerCase(), uc])
    );

    let uncategorizedCount = 0;

    // Merge classification results with original transaction data
    for (let j = 0; j < batch.length; j++) {
      const transaction = batch[j];

      // 1. Try index-based lookup
      let aiCategory = indexMap.get(j + 1);

      // 2. Fallback: normalized description match
      if (!aiCategory) {
        aiCategory = descMap.get(normalizeDescription(transaction.description));
      }

      // 3. Validate category exists (case-insensitive)
      if (aiCategory) {
        const exact = categoryLower.get(aiCategory.toLowerCase());
        aiCategory = exact ?? undefined;
      }

      if (!aiCategory) {
        uncategorizedCount++;
        aiCategory = "Uncategorized";
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
