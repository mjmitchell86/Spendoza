import { z } from "zod";

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------
export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().min(1).max(100),
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
