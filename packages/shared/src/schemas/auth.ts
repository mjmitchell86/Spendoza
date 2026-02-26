import { z } from "zod";

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------
export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().min(1).max(100),
  invite_code: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Waitlist
// ---------------------------------------------------------------------------
export const waitlistSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;

// ---------------------------------------------------------------------------
// Invite Codes
// ---------------------------------------------------------------------------
export interface InviteCode {
  id: string;
  code: string;
  created_by: string | null;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}
