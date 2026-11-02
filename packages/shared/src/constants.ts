export const MAX_HOUSEHOLD_MEMBERS = 10;
export const MAX_MANUAL_REPORTS_PER_MONTH = 2;
export const MAX_BANK_STATEMENT_SIZE_MB = 4;
/** The upload limit every client and the API enforce: 4 MiB, under Vercel's 4.5 MB request body limit. */
export const MAX_BANK_STATEMENT_BYTES = MAX_BANK_STATEMENT_SIZE_MB * 1024 * 1024;

export const SYSTEM_CATEGORIES = [
  "Housing",
  "Utilities",
  "Groceries",
  "Transportation",
  "Healthcare",
  "Insurance",
  "Entertainment",
  "Dining Out",
  "Personal",
  "Savings",
  "Debt Payments",
  "Subscriptions",
  "Other",
] as const;

export const ACCOUNT_DISABLED_CODE = "account_disabled";
export const ACCOUNT_DISABLED_MESSAGE =
  "This account has been disabled. Email hello@gravitaz.net if you think this is a mistake.";
