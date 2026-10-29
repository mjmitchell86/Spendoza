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

function InlineLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-primary underline underline-offset-4">
      {children}
    </Link>
  );
}

const sections: { heading: string; body: ReactNode }[] = [
  {
    heading: "How it works",
    body: (
      <ol>
        <li>Upload a bank statement, as a PDF or CSV file up to 10 MB.</li>
        <li>
          Spendoza reads it, finds the transactions and sorts them into categories. Check them, and
          change any category it got wrong.
        </li>
        <li>
          See where the money went on the dashboard: income against expenses, spending by category,
          and the recurring bills it found.
        </li>
        <li>Set savings and budget goals, and track debts, on the Starter or Pro plan.</li>
        <li>Invite your household with a code, on the Pro plan.</li>
      </ol>
    ),
  },
  {
    heading: "If a statement fails",
    body: (
      <p>
        Bank Statements shows what went wrong. Choose Retry to process it again, or Remove to delete
        it, including the file. If the same statement keeps failing, email <Email /> with the bank
        name and the file type, but not the statement itself.
      </p>
    ),
  },
  {
    heading: "Report emails",
    body: (
      <p>
        Spendoza emails a weekly report, plus quarterly and yearly ones. Choose the day and time, or
        turn them off, in Profile. Every report email also has an unsubscribe link.
      </p>
    ),
  },
  {
    heading: "Plans and billing",
    body: (
      <p>
        See the plans on the <InlineLink to="/pricing">pricing page</InlineLink>. To change or
        cancel a paid plan, go to Billing and choose Manage Subscription. Payments are handled by
        Stripe.
      </p>
    ),
  },
  {
    heading: "Households",
    body: (
      <p>
        On the Pro plan, the head of a household shares its invite code, and others join with it.
        Each member chooses what income and expenses to share. Members can leave at any time, and
        the head can remove members or hand the household to someone else.
      </p>
    ),
  },
  {
    heading: "Connecting an AI assistant",
    body: (
      <p>
        Spendoza works with AI assistants such as Claude and ChatGPT through its MCP server. In the
        app, MCP has setup steps and example questions. The assistant can read and change your
        Spendoza data, so only connect one you trust. To disconnect it, choose Disconnect AI
        assistants on the MCP page; that also signs you out on your other devices.
      </p>
    ),
  },
  {
    heading: "Delete your account",
    body: (
      <p>
        Go to Profile and choose Delete my account. It permanently deletes your account and your
        data, and cancels your subscription. If you're the head of a household with other members,
        hand the household to someone else first.
      </p>
    ),
  },
  {
    heading: "Get in touch",
    body: (
      <p>
        For help, bug reports and feature ideas, email <Email />.
      </p>
    ),
  },
];

export function SupportPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Support</h1>
        <p className="text-muted-foreground">
          Spendoza is a personal and household finance tracker, made by Gravitaz LLC. Upload your
          bank statements and it sorts your spending into categories, so you can set goals based on
          what you actually spend. Signing up needs an invite code, or you can join the waitlist.
        </p>
      </div>

      {sections.map((section) => (
        <section
          key={section.heading}
          className="flex flex-col gap-3 leading-7 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6"
        >
          <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
          {section.body}
        </section>
      ))}

      <p className="border-t pt-6 text-sm text-muted-foreground">
        Read the <InlineLink to="/privacy">privacy policy</InlineLink>.
      </p>
    </div>
  );
}
