import { z } from "zod";

// ---------------------------------------------------------------------------
// Ask advice (API input)
// ---------------------------------------------------------------------------
export const askAdviceSchema = z.object({
  question: z
    .string()
    .min(5, "Question must be at least 5 characters")
    .max(500, "Question must be under 500 characters"),
});

export type AskAdviceInput = z.infer<typeof askAdviceSchema>;

// ---------------------------------------------------------------------------
// Advice question row
// ---------------------------------------------------------------------------
export interface AdviceQuestion {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Advice response (API output)
// ---------------------------------------------------------------------------
export interface AdviceResponse {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Advice usage (API output)
// ---------------------------------------------------------------------------
export interface AdviceUsage {
  used: number;
  limit: number;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Daily question limits by tier
// ---------------------------------------------------------------------------
export const ADVICE_DAILY_LIMITS = {
  free: 0,
  starter: 2,
  pro: 5,
} as const;
