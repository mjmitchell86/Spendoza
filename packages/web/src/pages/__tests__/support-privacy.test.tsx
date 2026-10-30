import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PrivacyPage } from "../privacy";
import { SupportPage } from "../support";

// The approved text of the pages, in document order. A copy change shows up here for review.
const SUPPORT_TEXT: [string, string][] = [
  ["h1", "Support"],
  ["p", "Spendoza is a personal and household finance tracker, made by Gravitaz LLC. Upload your bank statements and it sorts your spending into categories, so you can set goals based on what you actually spend. Use it on the web at spendoza.io or in the iPhone app; it's the same account in both. Signing up needs an invite code, or you can join the waitlist."],
  ["h2", "How it works"],
  ["li", "Upload a bank statement, as a PDF or CSV file up to 10 MB."],
  ["li", "Spendoza reads it, finds the transactions and sorts them into categories. Check them, and change any category it got wrong."],
  ["li", "See where the money went: income against expenses, spending by category, and the recurring bills it found. The iPhone app sums it up as a monthly health score."],
  ["li", "Set savings and budget goals, and track debts, on the Starter or Pro plan."],
  ["li", "Invite your household with a code, on the Pro plan."],
  ["h2", "If a statement fails"],
  ["p", "On the website, Bank Statements shows what went wrong. Choose Retry to process it again, or Remove to delete it, including the file. If the same statement keeps failing, email hello@gravitaz.net with the bank name and the file type, but not the statement itself."],
  ["h2", "Report emails"],
  ["p", "Spendoza emails a weekly report, plus quarterly and yearly ones. Choose the day and time, or turn them off, in Profile on the website or under Me in the iPhone app. Every report email also has an unsubscribe link."],
  ["h2", "Plans and billing"],
  ["p", "See the plans on the pricing page. To change or cancel a paid plan, go to Billing on the website and choose Manage Subscription. In the iPhone app, Plans & billing under Me opens the website. Payments are handled by Stripe."],
  ["h2", "Households"],
  ["p", "On the Pro plan, the head of a household shares its invite code, and others join with it. Each member chooses what income and expenses to share. Members can leave at any time, and the head can remove members or hand the household to someone else."],
  ["h2", "Connecting an AI assistant"],
  ["p", "Spendoza works with AI assistants such as Claude and ChatGPT through its MCP server. The setup steps and example questions are on the MCP page on the website, and under Me, AI assistants in the iPhone app. The assistant can read and change your Spendoza data, so only connect one you trust. To disconnect it, choose Disconnect AI assistants in either place; that also signs you out on your other devices."],
  ["h2", "The iPhone app"],
  ["p", "The app locks with Face ID when you open it or come back to it. Turn that off, or choose a light or dark theme, under Me, Appearance & Face ID. The home screen and lock screen widgets show only your health score and whether it went up or down, never amounts. When a month's check-up is ready, the app sends a notification that says so, without any numbers."],
  ["h2", "Delete your account"],
  ["p", "Choose Delete my account in Profile on the website, or at the bottom of Me in the iPhone app. It permanently deletes your account and your data, and cancels your subscription. If you're the head of a household with other members, hand the household to someone else first."],
  ["h2", "Get in touch"],
  ["p", "For help, bug reports and feature ideas, email hello@gravitaz.net."],
  ["p", "Read the privacy policy."],
];
const SUPPORT_LINKS: [string, string][] = [
  ["hello@gravitaz.net", "mailto:hello@gravitaz.net"],
  ["pricing page", "/pricing"],
  ["hello@gravitaz.net", "mailto:hello@gravitaz.net"],
  ["privacy policy", "/privacy"],
];

const PRIVACY_TEXT: [string, string][] = [
  ["h1", "Privacy Policy"],
  ["p", "Spendoza is made by Gravitaz LLC. This page explains what it collects, what it does with it, and how to delete it. It covers the website at spendoza.io and the iPhone app."],
  ["p", "Effective October 30, 2026"],
  ["h2", "The short version"],
  ["p", "You give Spendoza your bank statements so it can sort your spending. It keeps the transactions it finds and deletes the statement file once processing finishes. OpenAI reads your statements to do that sorting. Spendoza has no ads and doesn't sell your data, and you can delete your account and everything in it at any time, from Profile on the website or Me in the iPhone app."],
  ["h2", "Your account"],
  ["li", "your email address"],
  ["li", "your password, which our sign-in provider stores only as a hash"],
  ["li", "your display name, and a profile photo if you add one"],
  ["li", "your time zone, read from your browser or phone so emails arrive at the right hour"],
  ["li", "your email report settings and your plan"],
  ["li", "invite codes you create, and who used them"],
  ["p", "A profile photo is stored at a public address: anyone who has the link can see it. In the iPhone app you pick a single photo; Spendoza doesn't get access to the rest of your photo library."],
  ["p", "If you join the waitlist instead, we store your name, email address, IP address and the approximate location (country, region and city) that IP address points to."],
  ["h2", "Bank statements"],
  ["p", "You upload statements as PDF or CSV files. From each one, Spendoza stores:"],
  ["li", "each transaction's date, description, amount, whether it's a debit or credit, and its category"],
  ["li", "the bank name and the last four digits of the account number"],
  ["li", "the file name, and a fingerprint of the file used to spot duplicate uploads"],
  ["li", "the statement's totals"],
  ["p", "The file itself is deleted once processing finishes. If processing fails, the file is kept so you can retry, until you retry successfully or remove the statement. Removing it deletes the file. If a statement ever gets stuck processing, email hello@gravitaz.net and we'll remove it and its file. Spendoza doesn't store your account balances or your full account number."],
  ["h2", "Things you add"],
  ["p", "Spendoza also stores what you enter yourself: income and expenses, categories, savings and budget goals, and debts (name, type, balance, interest rate and minimum payment). It finds recurring bills and income in your transactions and stores those too."],
  ["h2", "AI processing"],
  ["p", "Spendoza uses OpenAI's API for these features. Here is what each one sends:"],
  ["li", "Reading a statement: the full text of the statement. That usually includes whatever the bank printed on it, such as your name and address."],
  ["li", "Sorting transactions: each transaction's description, amount and type, and your category names."],
  ["li", "Naming recurring bills and income: their descriptions."],
  ["li", "Report insights and goal suggestions: your totals, category breakdown, debts and goal names."],
  ["li", "The financial advisor: your question; summaries of up to six monthly reports; your income sources, recurring expenses, debts and goals; and earlier messages in the same conversation."],
  ["p", "Spendoza doesn't add your name or email address to any of these. Your advisor questions and answers are saved in your account so you can see your history."],
  ["h2", "Report emails"],
  ["p", "Spendoza emails you a weekly report, plus quarterly and yearly ones, with a summary and a PDF of your report attached. They're on by default. Turn them off in Profile on the website or under Me in the iPhone app, or use the unsubscribe link in any report email."],
  ["h2", "Households"],
  ["p", "On the Pro plan you can create or join a household. Other members see your display name, your sharing settings, and the totals and category breakdown of whatever you choose to share. They don't see your individual transactions. Household goals and debts can be edited by any member, and a transaction or income entry assigned to a member is visible to that member."],
  ["h2", "Connecting an AI assistant"],
  ["p", "If you connect an AI assistant to Spendoza (such as Claude or ChatGPT, through Spendoza's MCP server), you sign in to Spendoza to allow it. The assistant can then read your Spendoza data and add, change or delete income, expenses, goals and debts, depending on your plan. Whatever it reads is sent to that assistant's provider and handled under their privacy policy. To disconnect, choose Disconnect AI assistants on the MCP page on the website, or under Me, AI assistants in the iPhone app. That signs out every other session, including connected assistants: Spendoza stops accepting their sign-in right away, and the sign-in itself expires shortly after."],
  ["h2", "Payments"],
  ["p", "Paid plans are handled by Stripe. Spendoza creates a Stripe customer with your email address and stores your Stripe customer and subscription IDs and your plan's status. Your card details go to Stripe directly; Spendoza never sees them."],
  ["h2", "Services that process your data"],
  ["li", "Supabase: the database, file storage and sign-in"],
  ["li", "Vercel: hosting the website, the API and the MCP server"],
  ["li", "OpenAI: the AI features above"],
  ["li", "Stripe: payments"],
  ["li", "Resend: sending report emails"],
  ["li", "Apple: distributing the iPhone app. If you test it through TestFlight, Apple also passes on crash reports and any feedback you choose to send"],
  ["li", "ip-api.com: looking up the approximate location of waitlist sign-ups"],
  ["p", "Each receives only what it needs to do its job. Like any web request, they see your device's IP address as part of normal network traffic."],
  ["h2", "On your iPhone"],
  ["p", "The iPhone app keeps a few things on your phone so it opens quickly and works offline:"],
  ["li", "your sign-in, in the iPhone's Keychain"],
  ["li", "a copy of your profile and your recent monthly reports"],
  ["li", "for the home screen and lock screen widgets: your health score, its band (such as Fair), last month's score and the month. No amounts, categories or transactions"],
  ["li", "PDF reports you open, until you close them"],
  ["p", "Signing out or deleting your account removes all of these from the phone. Face ID is handled by iOS: Spendoza only learns whether unlocking worked and never sees your face data. The \"check-up is ready\" notification is created on your phone and contains no amounts; the app checks for a new report in the background to send it."],
  ["h2", "Cookies and analytics"],
  ["p", "Spendoza sets no cookies. On the website, your browser's local storage keeps you signed in and remembers your light or dark theme. Spendoza counts page views with Vercel Web Analytics, which doesn't use cookies, and loads its font from Google Fonts. The iPhone app has no analytics, advertising or tracking code."],
  ["h2", "Who at Gravitaz can see your data"],
  ["p", "Spendoza's admin tools show a list of accounts (display name, email address, plan and sign-up date) and usage totals. To fix a problem, an admin can regenerate your report, which shows your report's contents. Your data is never sold or used for advertising."],
  ["h2", "Deleting your data"],
  ["p", "To delete everything, choose Delete my account in Profile on the website, or at the bottom of Me in the iPhone app. It permanently deletes your account and your data: your profile and photo, statements and transactions, income, expenses, categories, goals, debts, reports, advisor history and email settings, and it cancels your subscription."],
  ["p", "You can also delete individual income and expense entries, categories, goals, debts and failed statements. Transactions can be edited but not deleted one at a time."],
  ["p", "If you're the head of a household with other members, transfer ownership before deleting your account. Household goals and debts you created stay with the household. Stripe keeps its own records of past payments, and copies in our providers' logs and backups expire on their own schedules."],
  ["h2", "Children"],
  ["p", "Spendoza isn't directed to children under 13, and we don't knowingly collect their personal information. If you think a child under 13 has an account, email hello@gravitaz.net and we'll delete it."],
  ["h2", "Changes"],
  ["p", "We'll update this page and its date if Spendoza's data practices change."],
  ["h2", "Contact"],
  ["p", "Questions about this policy? Email hello@gravitaz.net."],
  ["p", "Need help with the app? See Support."],
];
const PRIVACY_LINKS: [string, string][] = [
  ["hello@gravitaz.net", "mailto:hello@gravitaz.net"],
  ["hello@gravitaz.net", "mailto:hello@gravitaz.net"],
  ["hello@gravitaz.net", "mailto:hello@gravitaz.net"],
  ["Support", "/support"],
];

function renderPage(page: React.ReactElement) {
  return render(<MemoryRouter>{page}</MemoryRouter>).container;
}

function textOf(container: HTMLElement) {
  return [...container.querySelectorAll("h1, h2, p, li")].map(
    (el) => [el.tagName.toLowerCase(), el.textContent] as [string, string | null],
  );
}

function linksOf(container: HTMLElement) {
  return [...container.querySelectorAll("a")].map(
    (a) => [a.textContent, a.getAttribute("href")] as [string | null, string | null],
  );
}

describe("legal pages", () => {
  afterEach(cleanup);

  it("Support keeps every heading, paragraph and list item, in order", () => {
    expect(textOf(renderPage(<SupportPage />))).toEqual(SUPPORT_TEXT);
  });

  it("Support links the email, the pricing page and the privacy policy", () => {
    expect(linksOf(renderPage(<SupportPage />))).toEqual(SUPPORT_LINKS);
  });

  it("Support keeps the numbered steps as an ordered list", () => {
    const c = renderPage(<SupportPage />);
    expect(c.querySelectorAll("ol li")).toHaveLength(5);
    expect(c.querySelectorAll("ul")).toHaveLength(0);
  });

  it("Privacy keeps every heading, paragraph and list item, in order", () => {
    expect(textOf(renderPage(<PrivacyPage />))).toEqual(PRIVACY_TEXT);
  });

  it("Privacy links the email and Support", () => {
    expect(linksOf(renderPage(<PrivacyPage />))).toEqual(PRIVACY_LINKS);
  });

  it("Privacy shows its effective date and keeps its bullet lists", () => {
    const c = renderPage(<PrivacyPage />);
    expect(c.textContent).toContain("Effective October 30, 2026");
    expect(c.querySelectorAll("ul")).toHaveLength(5);
    expect(c.querySelectorAll("ol")).toHaveLength(0);
  });
});
