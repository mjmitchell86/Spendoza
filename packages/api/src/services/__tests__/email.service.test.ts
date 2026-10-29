import { describe, it, expect, beforeEach, mock } from "bun:test";

const INVITE_CODE = "abc12345";
const sent: any[] = [];
let sendResult: any = { data: { id: "email-1" }, error: null };
let sendThrows = false;

mock.module("resend", () => ({
  Resend: class {
    emails = {
      send: (payload: any) => {
        sent.push(payload);
        if (sendThrows) return Promise.reject(new Error("network down"));
        return Promise.resolve(sendResult);
      },
    };
  },
}));

const { sendHouseholdInvitationEmail } = await import("../email.service");

beforeEach(() => {
  sent.length = 0;
  sendResult = { data: { id: "email-1" }, error: null };
  sendThrows = false;
});

describe("sendHouseholdInvitationEmail", () => {
  const send = (
    inviter = "Matt",
    household = "The Smiths",
    code = "abcdefghjk"
  ) =>
    sendHouseholdInvitationEmail(
      "invitee@example.com",
      inviter,
      household,
      code
    );

  it("sends from the Spendoza address with a fixed subject", async () => {
    await send();
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe("Spendoza <reports@spendoza.io>");
    expect(sent[0].to).toBe("invitee@example.com");
    expect(sent[0].subject).toBe(
      "You've been invited to a household on Spendoza"
    );
  });

  it("keeps names out of the subject and quotes them in the body", async () => {
    await send("Matt", "The Smiths");
    expect(sent[0].subject).not.toContain("Matt");
    expect(sent[0].subject).not.toContain("Smiths");
    expect(sent[0].text).toContain('"Matt"');
    expect(sent[0].text).toContain('"The Smiths"');
    expect(sent[0].html).toContain("&quot;Matt&quot;");
  });

  it("shows the invitation code and links to the household page with it", async () => {
    await send();
    for (const body of [sent[0].html, sent[0].text]) {
      expect(body).toContain("Your invitation code: ");
      expect(body).toContain("ABCDE-FGHJK");
      expect(body).toContain(
        "https://www.spendoza.io/household?invitation=ABCDE-FGHJK"
      );
      expect(body).not.toContain(INVITE_CODE);
    }
  });

  it("invites people without an account to sign up with the code, linking the url-encoded email", async () => {
    await send();
    const signupUrl =
      "https://www.spendoza.io/signup?invitation=ABCDE-FGHJK&email=invitee%40example.com";
    expect(sent[0].text).toContain(
      "New to Spendoza? Create your account with invitation code ABCDE-FGHJK"
    );
    expect(sent[0].text).toContain(signupUrl);
    expect(sent[0].html).toContain(
      "New to Spendoza? Create your account with invitation code <strong>ABCDE-FGHJK</strong>"
    );
    // the ampersand in the href is HTML-escaped
    expect(sent[0].html).toContain(signupUrl.replace("&", "&amp;"));
    expect(sent[0].html).not.toContain("?invitation=ABCDE-FGHJK&email");
    for (const body of [sent[0].html, sent[0].text]) {
      expect(body).not.toContain(INVITE_CODE);
    }
  });

  it("escapes a hostile recipient address in the signup link", async () => {
    await sendHouseholdInvitationEmail(
      'a"><script>@example.com',
      "Matt",
      "HH",
      "abcdefghjk"
    );
    expect(sent[0].html).not.toContain("<script>");
    expect(sent[0].html).not.toContain('a"><');
  });

  it("escapes names in the HTML", async () => {
    await send('<script>alert("x")</script>', "Tom & <b>Jerry</b>");
    expect(sent[0].html).not.toContain("<script>");
    expect(sent[0].html).not.toContain("<b>Jerry</b>");
    expect(sent[0].html).toContain("&lt;script&gt;");
    expect(sent[0].html).toContain("Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;");
  });

  it("strips newlines and truncates names to 60 characters", async () => {
    await send("Matt\r\nBcc: evil@example.com", "x".repeat(100));
    expect(sent[0].text).not.toContain("\nBcc");
    expect(sent[0].text).toContain("Matt Bcc: evil@example.com");
    expect(sent[0].text).toContain('"' + "x".repeat(60) + '"');
    expect(sent[0].text).not.toContain("x".repeat(61));
    expect(sent[0].html).not.toContain("x".repeat(61));
  });

  it("throws when Resend returns an error", async () => {
    sendResult = { data: null, error: { message: "domain not verified" } };
    await expect(
      sendHouseholdInvitationEmail("a@example.com", "Matt", "HH", "abcdefghjk")
    ).rejects.toThrow("domain not verified");
  });

  it("throws when the request itself fails", async () => {
    sendThrows = true;
    await expect(
      sendHouseholdInvitationEmail("a@example.com", "Matt", "HH", "abcdefghjk")
    ).rejects.toThrow("network down");
  });
});
