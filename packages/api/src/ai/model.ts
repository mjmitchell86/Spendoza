// The OpenAI models the AI features use. When changing one, add its per-token
// price to MODEL_PRICING in llm-usage-logger.ts so cost estimates keep working.

// High-volume structured work: reading statements, sorting transactions and
// naming recurring items. In a side-by-side run on a 52-transaction statement,
// gpt-6-luna matched gpt-6.1-terra on extraction and categorization at about a
// tenth of the price.
export const OPENAI_FAST_MODEL = "gpt-6-luna";

// Writing for the user: the financial advisor, report insights and goal suggestions.
export const OPENAI_MODEL = "gpt-6.1-terra";
