/** Crockford base-32 alphabet (no i, l, o, u), lowercase. */
export const HOUSEHOLD_CODE_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const HOUSEHOLD_CODE_LENGTH = 10;

/** Strip whitespace and hyphens, lowercase. Applied to join input. */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, "").toLowerCase();
}

/** Display form: 10-char codes become ABCDE-FGHJK; anything else is uppercased as-is. */
export function formatInviteCode(code: string): string {
  const upper = code.toUpperCase();
  if (code.length !== HOUSEHOLD_CODE_LENGTH) return upper;
  return `${upper.slice(0, 5)}-${upper.slice(5)}`;
}
