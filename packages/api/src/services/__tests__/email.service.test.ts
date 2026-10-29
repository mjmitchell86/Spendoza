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
  it("sends from the Spendoza address with the invite subject", async () => {
    await sendHouseholdInvitationEmail(
      "invitee@example.com",
      "Matt",
      "The Smiths",
      ""
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe("Spendoza <reports@spendoza.io>");
    expect(sent[0].to).toBe("invitee@example.com");
    expect(sent[0].subject).toBe("Matt invited you to The Smiths on Spendoza");
  });

  it("links to the household page and never contains a household code", async () => {
    await sendHouseholdInvitationEmail(
      "invitee@example.com",
      "Matt",
      "The Smiths",
      ""
    );
    for (const body of [sent[0].html, sent[0].text]) {
      expect(body).toContain("https://www.spendoza.io/household");
      expect(body).not.toContain(INVITE_CODE);
      expect(body).not.toContain("New to Spendoza?");
    }
  });

  it("adds the new-account paragraph when an invitation code is given", async () => {
    await sendHouseholdInvitationEmail(
      "a+b@example.com",
      "Matt",
      "The Smiths",
      "ABCDE-FGHJK"
    );
    const link =
      "https://www.spendoza.io/signup?invitation=ABCDE-FGHJK&email=a%2Bb%40example.com";
    expect(sent[0].text).toContain("New to Spendoza?");
    expect(sent[0].text).toContain("ABCDE-FGHJK");
    expect(sent[0].text).toContain(link);
    expect(sent[0].html).toContain("New to Spendoza?");
    expect(sent[0].html).toContain(link.replace("&", "&amp;"));
  });

  it("escapes inviter and household names in the HTML", async () => {
    await sendHouseholdInvitationEmail(
      "invitee@example.com",
      '<script>alert("x")</script>',
      "Tom & <b>Jerry</b>",
      ""
    );
    expect(sent[0].html).not.toContain("<script>");
    expect(sent[0].html).not.toContain("<b>Jerry</b>");
    expect(sent[0].html).toContain("&lt;script&gt;");
    expect(sent[0].html).toContain("Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;");
  });

  it("throws when Resend returns an error", async () => {
    sendResult = { data: null, error: { message: "domain not verified" } };
    await expect(
      sendHouseholdInvitationEmail("a@example.com", "Matt", "HH", "")
    ).rejects.toThrow("domain not verified");
  });

  it("throws when the request itself fails", async () => {
    sendThrows = true;
    await expect(
      sendHouseholdInvitationEmail("a@example.com", "Matt", "HH", "")
    ).rejects.toThrow("network down");
  });
});
