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
// Follow-up advice (API input)
// ---------------------------------------------------------------------------
export const followUpAdviceSchema = z.object({
  question: z
    .string()
    .min(5, "Follow-up must be at least 5 characters")
    .max(500, "Follow-up must be under 500 characters"),
});

export type FollowUpAdviceInput = z.infer<typeof followUpAdviceSchema>;

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
  thread_id: string;
  message_index: number;
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
export const MAX_THREAD_MESSAGES = 5;

export const ADVICE_DAILY_LIMITS = {
  free: 0,
  starter: 2,
  pro: 5,
} as const;
