const APP_URL = "https://www.spendoza.io";

export interface HouseholdInvitationEmailInput {
  to: string;
  inviterName: string;
  householdName: string;
  /** Per-invitation sign-up code. Empty omits the "New to Spendoza?" part. */
  invitationCode: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildHouseholdInvitationEmail(
  input: HouseholdInvitationEmailInput
) {
  const { to, inviterName, householdName, invitationCode } = input;
  const subject = `${inviterName} invited you to ${householdName} on Spendoza`;
  const acceptUrl = `${APP_URL}/household`;
  const signupUrl = `${APP_URL}/signup?invitation=${encodeURIComponent(
    invitationCode
  )}&email=${encodeURIComponent(to)}`;

  const inviter = escapeHtml(inviterName);
  const household = escapeHtml(householdName);

  const newToSpendozaHtml = invitationCode
    ? `<p style="margin:24px 0 0;font-size:14px;color:#475569;">New to Spendoza? Create your account with invitation code <strong>${escapeHtml(
        invitationCode
      )}</strong>: <a href="${escapeHtml(signupUrl)}">Create your account</a>.</p>`
    : "";

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;">You're invited to ${household}</h1>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${inviter} invited you to join <strong>${household}</strong> on Spendoza. The invitation is valid for 7 days.</p>
      <p style="margin:0;"><a href="${acceptUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:16px;">Accept invitation</a></p>
      ${newToSpendozaHtml}
    </div>
  </body>
</html>`;

  const text = [
    `${inviterName} invited you to join ${householdName} on Spendoza. The invitation is valid for 7 days.`,
    "",
    `Accept invitation: ${acceptUrl}`,
    ...(invitationCode
      ? [
          "",
          `New to Spendoza? Create your account with invitation code ${invitationCode}: ${signupUrl}`,
        ]
      : []),
  ].join("\n");

  return { subject, html, text };
}
