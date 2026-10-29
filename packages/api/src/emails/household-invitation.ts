import { formatInviteCode } from "@spendoza/shared";

const APP_URL = "https://www.spendoza.io";
const MAX_NAME_LENGTH = 60;

export interface HouseholdInvitationEmailInput {
  inviterName: string;
  householdName: string;
  /** The invitation's own code, as stored (lowercase). */
  invitationCode: string;
  /** The address the invitation is sent to (prefills the sign-up form). */
  recipientEmail: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Names are user-supplied and go to a third party: one line, bounded length.
function cleanName(value: string): string {
  const oneLine = value.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
  return Array.from(oneLine).slice(0, MAX_NAME_LENGTH).join("");
}

export function buildHouseholdInvitationEmail(
  input: HouseholdInvitationEmailInput
) {
  const inviterName = cleanName(input.inviterName);
  const householdName = cleanName(input.householdName);
  const code = formatInviteCode(input.invitationCode);
  const subject = "You've been invited to a household on Spendoza";
  const acceptUrl = `${APP_URL}/household?invitation=${encodeURIComponent(code)}`;

  const signupUrl = `${APP_URL}/signup?invitation=${encodeURIComponent(code)}&email=${encodeURIComponent(input.recipientEmail)}`;
  const newToSpendoza =
    "New to Spendoza? Create your account with invitation code";

  const inviter = escapeHtml(`"${inviterName}"`);
  const household = escapeHtml(`"${householdName}"`);

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;">You've been invited to a household</h1>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${inviter} invited you to join the household ${household} on Spendoza. The invitation is valid for 7 days.</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">Your invitation code: <strong>${escapeHtml(code)}</strong></p>
      <p style="margin:0;"><a href="${escapeHtml(acceptUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:16px;">Accept invitation</a></p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#475569;">${newToSpendoza} <strong>${escapeHtml(code)}</strong>: <a href="${escapeHtml(signupUrl)}" style="color:#0f172a;">Create your account</a></p>
    </div>
  </body>
</html>`;

  const text = [
    `"${inviterName}" invited you to join the household "${householdName}" on Spendoza. The invitation is valid for 7 days.`,
    "",
    `Your invitation code: ${code}`,
    "",
    `Accept invitation: ${acceptUrl}`,
    "",
    `${newToSpendoza} ${code}: ${signupUrl}`,
  ].join("\n");

  return { subject, html, text };
}
