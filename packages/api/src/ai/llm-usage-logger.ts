import { supabaseAdmin } from "../lib/supabase";

interface LlmUsageEntry {
  user_id: string | null;
  call_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

// Cost per token by model (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.25 / 1_000_000, output: 2.0 / 1_000_000 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

/**
 * Logs LLM token usage to the llm_usage_log table.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function logLlmUsage(entry: LlmUsageEntry): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("llm_usage_log").insert({
      user_id: entry.user_id,
      call_type: entry.call_type,
      model: entry.model,
      input_tokens: entry.input_tokens,
      output_tokens: entry.output_tokens,
      total_tokens: entry.total_tokens,
      cost_estimate: estimateCost(entry.model, entry.input_tokens, entry.output_tokens),
    });

    if (error) {
      console.error("[llm-usage-logger] Failed to log usage:", error.message);
    }
  } catch (err) {
    console.error("[llm-usage-logger] Unexpected error:", err);
  }
}
