import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a financial assistant. Given a list of raw bank transaction descriptions, generate a short, human-friendly name for each one.

Respond ONLY with valid JSON in this exact format:
{"names": [{"index": 1, "friendly_name": "..."}, {"index": 2, "friendly_name": "..."}, ...]}

Rules:
- The friendly name should be the recognizable brand, company, or service name (e.g. "NETFLIX.COM" → "Netflix", "SPOTIFY USA" → "Spotify", "STATE FARM INSURANCE" → "State Farm Insurance")
- Remove reference numbers, account numbers, transaction codes, and other noise
- Use proper capitalization (title case)
- Keep it short — 1 to 4 words maximum
- If the description is already clean and readable, return it with proper capitalization
- The "index" field must match the transaction number from the input list`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate friendly display names for raw bank transaction descriptions.
 * Returns a map of original description → friendly name.
 */
export async function generateFriendlyNames(
  descriptions: string[]
): Promise<Map<string, string>> {
  if (descriptions.length === 0) return new Map();

  console.log(
    `[friendly-name] Generating friendly names for ${descriptions.length} description(s)`
  );

  const model = new ChatOpenAI({
    modelName: "gpt-5-mini",
    timeout: 30_000,
  });

  const descriptionList = descriptions
    .map((d, i) => `${i + 1}. "${d}"`)
    .join("\n");

  const userPrompt = `Raw bank transaction descriptions:\n${descriptionList}`;

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

    console.log(`[friendly-name] Response received in ${elapsed}ms`);
  } catch (error) {
    console.error("[friendly-name] OpenAI API call failed:", error);
    return new Map();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error(
      "[friendly-name] Failed to parse AI response as JSON. Raw:",
      content.slice(0, 500)
    );
    return new Map();
  }

  const names: Array<{ index?: number; friendly_name?: string }> =
    parsed.names ?? [];

  const result = new Map<string, string>();
  for (const entry of names) {
    if (
      entry.index != null &&
      entry.friendly_name &&
      entry.index >= 1 &&
      entry.index <= descriptions.length
    ) {
      result.set(descriptions[entry.index - 1], entry.friendly_name);
    }
  }

  console.log(
    `[friendly-name] Generated ${result.size} friendly name(s)`
  );
  return result;
}
