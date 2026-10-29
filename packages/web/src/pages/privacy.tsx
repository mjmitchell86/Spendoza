import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const CONTACT_EMAIL = "hello@gravitaz.net";

function Email() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary underline underline-offset-4">
      {CONTACT_EMAIL}
    </a>
  );
}

const sections: { heading: string; body: ReactNode }[] = [
  {
    heading: "The short version",
    body: (
      <p>
        You give Spendoza your bank statements so it can sort your spending. It keeps the
        transactions it finds and deletes the statement file once processing finishes. OpenAI reads
        your statements to do that sorting. Spendoza has no ads and doesn't sell your data, and you
        can delete your account and everything in it from your Profile at any time.
      </p>
    ),
  },
  {
    heading: "Your account",
    body: (
      <>
        <ul>
          <li>your email address</li>
          <li>your password, which our sign-in provider stores only as a hash</li>
          <li>your display name, and a profile photo if you add one</li>
          <li>your time zone, read from your browser so emails arrive at the right hour</li>
          <li>your email report settings and your plan</li>
          <li>invite codes you create, and who used them</li>
        </ul>
        <p>A profile photo is stored at a public address: anyone who has the link can see it.</p>
        <p>
          If you join the waitlist instead, we store your name, email address, IP address and the
          approximate location (country, region and city) that IP address points to.
        </p>
      </>
    ),
  },
  {
    heading: "Bank statements",
    body: (
      <>
        <p>You upload statements as PDF or CSV files. From each one, Spendoza stores:</p>
        <ul>
          <li>
            each transaction's date, description, amount, whether it's a debit or credit, and its
            category
          </li>
          <li>the bank name and the last four digits of the account number</li>
          <li>the file name, and a fingerprint of the file used to spot duplicate uploads</li>
          <li>the statement's totals</li>
        </ul>
        <p>
          The file itself is deleted once processing finishes. If processing fails, the file is kept
          so you can retry, until you retry successfully or remove the statement. Removing it
          deletes the file. If a statement ever gets stuck processing, email <Email /> and we'll
          remove it and its file. Spendoza doesn't store your account balances or your full account
          number.
        </p>
      </>
    ),
  },
  {
    heading: "Things you add",
    body: (
      <p>
        Spendoza also stores what you enter yourself: income and expenses, categories, savings and
        budget goals, and debts (name, type, balance, interest rate and minimum payment). It finds
        recurring bills and income in your transactions and stores those too.
      </p>
    ),
  },
  {
    heading: "AI processing",
    body: (
      <>
        <p>Spendoza uses OpenAI's API for these features. Here is what each one sends:</p>
        <ul>
          <li>
            Reading a statement: the full text of the statement. That usually includes whatever the
            bank printed on it, such as your name and address.
          </li>
          <li>
            Sorting transactions: each transaction's description, amount and type, and your
            category names.
          </li>
          <li>Naming recurring bills and income: their descriptions.</li>
          <li>
            Report insights and goal suggestions: your totals, category breakdown, debts and goal
            names.
          </li>
          <li>
            The financial advisor: your question; summaries of up to six monthly reports; your
            income sources, recurring expenses, debts and goals; and earlier messages in the same
            conversation.
          </li>
        </ul>
        <p>
          Spendoza doesn't add your name or email address to any of these. Your advisor questions
          and answers are saved in your account so you can see your history.
        </p>
      </>
    ),
  },
  {
    heading: "Report emails",
    body: (
      <p>
        Spendoza emails you a weekly report, plus quarterly and yearly ones, with a summary and a
        PDF of your report attached. They're on by default. Turn them off in Profile, or use the
        unsubscribe link in any report email.
      </p>
    ),
  },
  {
    heading: "Households",
    body: (
      <p>
        On the Pro plan you can create or join a household. Other members see your display name,
        your sharing settings, and the totals and category breakdown of whatever you choose to
        share. They don't see your individual transactions. Household goals and debts can be
        edited by any member, and a transaction or income entry assigned to a member is visible to
        that member.
      </p>
    ),
  },
  {
    heading: "Connecting an AI assistant",
    body: (
      <p>
        If you connect an AI assistant to Spendoza (such as Claude or ChatGPT, through Spendoza's
        MCP server), you sign in to Spendoza to allow it. The assistant can then read your Spendoza
        data and add, change or delete income, expenses, goals and debts, depending on your plan.
        Whatever it reads is sent to that assistant's provider and handled under their privacy
        policy.
      </p>
    ),
  },
  {
    heading: "Payments",
    body: (
      <p>
        Paid plans are handled by Stripe. Spendoza creates a Stripe customer with your email address
        and stores your Stripe customer and subscription IDs and your plan's status. Your card
        details go to Stripe directly; Spendoza never sees them.
      </p>
    ),
  },
  {
    heading: "Services that process your data",
    body: (
      <>
        <ul>
          <li>Supabase: the database, file storage and sign-in</li>
          <li>Vercel: hosting the website, the API and the MCP server</li>
          <li>OpenAI: the AI features above</li>
          <li>Stripe: payments</li>
          <li>Resend: sending report emails</li>
          <li>ip-api.com: looking up the approximate location of waitlist sign-ups</li>
        </ul>
        <p>
          Each receives only what it needs to do its job. Like any web request, they see your
          device's IP address as part of normal network traffic.
        </p>
      </>
    ),
  },
  {
    heading: "Cookies and analytics",
    body: (
      <p>
        Spendoza sets no cookies. Your browser's local storage keeps you signed in and remembers
        your light or dark theme. Spendoza counts page views with Vercel Web Analytics, which
        doesn't use cookies, and loads its font from Google Fonts.
      </p>
    ),
  },
  {
    heading: "Who at Gravitaz can see your data",
    body: (
      <p>
        Spendoza's admin tools show a list of accounts (display name, email address, plan and
        sign-up date) and usage totals. To fix a problem, an admin can regenerate your report, which
        shows your report's contents. Your data is never sold or used for advertising.
      </p>
    ),
  },
  {
    heading: "Deleting your data",
    body: (
      <>
        <p>
          To delete everything, go to Profile and choose Delete my account. It permanently deletes
          your account and your data: your profile and photo, statements and transactions, income,
          expenses, categories, goals, debts, reports, advisor history and email settings, and it
          cancels your subscription.
        </p>
        <p>
          You can also delete individual income and expense entries, categories, goals, debts and
          failed statements. Transactions can be edited but not deleted one at a time.
        </p>
        <p>
          If you're the head of a household with other members, transfer ownership before deleting
          your account. Household goals and debts you created stay with the household. Stripe keeps
          its own records of past payments, and copies in our providers' logs and backups expire on
          their own schedules.
        </p>
      </>
    ),
  },
  {
    heading: "Children",
    body: (
      <p>
        Spendoza isn't directed to children under 13, and we don't knowingly collect their personal
        information. If you think a child under 13 has an account, email <Email /> and we'll delete
        it.
      </p>
    ),
  },
  {
    heading: "Changes",
    body: <p>We'll update this page and its date if Spendoza's data practices change.</p>,
  },
  {
    heading: "Contact",
    body: (
      <p>
        Questions about this policy? Email <Email />.
      </p>
    ),
  },
];

export function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-muted-foreground">
          Spendoza is made by Gravitaz LLC. This page explains what it collects, what it does with
          it, and how to delete it.
        </p>
        <p className="text-sm text-muted-foreground">Effective October 29, 2026</p>
      </div>

      {sections.map((section) => (
        <section
          key={section.heading}
          className="flex flex-col gap-3 leading-7 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6"
        >
          <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
          {section.body}
        </section>
      ))}

      <p className="border-t pt-6 text-sm text-muted-foreground">
        Need help with the app? See{" "}
        <Link to="/support" className="font-medium text-primary underline underline-offset-4">
          Support
        </Link>
        .
      </p>
    </div>
  );
}
