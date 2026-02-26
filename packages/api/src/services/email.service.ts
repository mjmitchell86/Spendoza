import { Resend } from "resend";

const FROM_ADDRESS = "Spendoza <no-reply@spendoza.io>";

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
