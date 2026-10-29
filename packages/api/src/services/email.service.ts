import { Resend } from "resend";
import { buildHouseholdInvitationEmail } from "../emails/household-invitation";

const FROM_ADDRESS = "Spendoza <reports@spendoza.io>";

interface SendReportEmailInput {
  to: string;
  subject: string;
  htmlBody: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

interface SendResult {
  success: boolean;
  emailId?: string;
  error?: string;
}

export async function sendReportEmail(
  input: SendReportEmailInput
): Promise<SendResult> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: input.to,
    subject: input.subject,
    html: input.htmlBody,
    attachments: [
      {
        filename: input.pdfFilename,
        content: input.pdfBuffer,
      },
    ],
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, emailId: data?.id };
}

export async function sendHouseholdInvitationEmail(
  to: string,
  inviterName: string,
  householdName: string,
  invitationCode: string
): Promise<void> {
  const { subject, html, text } = buildHouseholdInvitationEmail({
    to,
    inviterName,
    householdName,
    invitationCode,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message);
  }
}
