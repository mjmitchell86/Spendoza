import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock resend before importing the service
const mockSend = mock(() =>
  Promise.resolve({ data: { id: "email-123" }, error: null })
);
mock.module("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

// Now import the service
const { sendReportEmail } = await import("../../services/email.service");

describe("email.service", () => {
  beforeEach(() => {
    mockSend.mockClear();
    process.env.RESEND_API_KEY = "re_test_123";
  });

  it("sends email with PDF attachment via Resend", async () => {
    const result = await sendReportEmail({
      to: "user@example.com",
      subject: "Your Spendoza Report — January 2026",
      htmlBody: "<h1>Report</h1>",
      pdfBuffer: Buffer.from("fake-pdf"),
      pdfFilename: "spendoza-report-2026-01.pdf",
    });

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const callArgs = mockSend.mock.calls[0][0] as any;
    expect(callArgs.from).toBe("Spendoza <reports@spendoza.io>");
    expect(callArgs.to).toBe("user@example.com");
    expect(callArgs.subject).toBe("Your Spendoza Report — January 2026");
    expect(callArgs.attachments).toHaveLength(1);
    expect(callArgs.attachments[0].filename).toBe("spendoza-report-2026-01.pdf");
  });

  it("returns error when Resend fails", async () => {
    mockSend.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: { message: "API key invalid" } })
    );

    const result = await sendReportEmail({
      to: "user@example.com",
      subject: "Test",
      htmlBody: "<h1>Test</h1>",
      pdfBuffer: Buffer.from("fake-pdf"),
      pdfFilename: "test.pdf",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("API key invalid");
  });
});
