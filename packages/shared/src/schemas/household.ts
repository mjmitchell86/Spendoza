import { z } from "zod";
import {
  incomeSharingModeSchema,
  expenseSharingModeSchema,
  type IncomeSharingMode,
  type ExpenseSharingMode,
} from "./profile";

// ---------------------------------------------------------------------------
// Create household
// ---------------------------------------------------------------------------
export const createHouseholdSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

// ---------------------------------------------------------------------------
// Invite member
// ---------------------------------------------------------------------------
export const inviteToHouseholdSchema = z.object({
  email: z.string().email(),
});

export type InviteToHouseholdInput = z.infer<typeof inviteToHouseholdSchema>;

// ---------------------------------------------------------------------------
// Join household
// ---------------------------------------------------------------------------
export const joinHouseholdSchema = z.object({
  invite_code: z.string().min(1),
});

export type JoinHouseholdInput = z.infer<typeof joinHouseholdSchema>;

// ---------------------------------------------------------------------------
// Update sharing preferences
// ---------------------------------------------------------------------------
export const updateSharingSchema = z.object({
  income_sharing_mode: incomeSharingModeSchema,
  shared_income_amount: z.number().positive().nullable(),
  expense_sharing_mode: expenseSharingModeSchema,
});

export type UpdateSharingInput = z.infer<typeof updateSharingSchema>;

// ---------------------------------------------------------------------------
// Transfer ownership
// ---------------------------------------------------------------------------
export const transferOwnershipSchema = z.object({
  new_head_id: z.string().uuid(),
});

export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;

// ---------------------------------------------------------------------------
// Full household row
// ---------------------------------------------------------------------------
export interface Household {
  id: string;
  name: string;
  head_of_household_id: string;
  invite_code: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Household member (joined view)
// ---------------------------------------------------------------------------
export interface HouseholdMember {
  id: string;
  display_name: string;
  income_sharing_mode: IncomeSharingMode;
  expense_sharing_mode: ExpenseSharingMode;
}
