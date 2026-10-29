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
// Rename household
// ---------------------------------------------------------------------------
export const renameHouseholdSchema = z.object({
  name: z.string().min(1).max(100),
});

export type RenameHouseholdInput = z.infer<typeof renameHouseholdSchema>;

// ---------------------------------------------------------------------------
// Delete household (the head types the household name to confirm)
// ---------------------------------------------------------------------------
export const deleteHouseholdSchema = z.object({
  confirm_name: z.string(),
});

export type DeleteHouseholdInput = z.infer<typeof deleteHouseholdSchema>;

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
// Accept or decline an invitation (the code from the invitation email)
// ---------------------------------------------------------------------------
export const invitationCodeSchema = z.object({
  code: z.string().min(1).max(64),
});

export type InvitationCodeInput = z.infer<typeof invitationCodeSchema>;

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
