import { Link } from "react-router-dom";
import {
  BarChart3,
  FileText,
  Target,
  Mail,
  Users,
  Check,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: BarChart3,
    title: "Dashboard & Insights",
    description:
      "Get a clear picture of your finances at a glance. Track income, expenses, and savings trends over time with interactive charts.",
    bullets: [
      "Income vs. expenses breakdown",
      "Spending by category visualization",
      "Month-over-month trend tracking",
      "AI-powered financial insights",
    ],
  },
  {
    icon: FileText,
    title: "Bank Statement Processing",
    description:
      "Upload your bank statement PDFs and let Spendoza do the heavy lifting. Transactions are automatically extracted and categorized.",
    bullets: [
      "PDF bank statement upload",
      "Automatic transaction extraction",
      "Smart AI categorization",
      "Review and adjust categories",
    ],
  },
  {
    icon: Target,
    title: "Goals & Budgets",
    description:
      "Set financial goals and track your progress. Create budgets per category, monthly savings targets, or long-term savings goals.",
    bullets: [
      "Category budget limits",
      "Monthly savings targets",
      "Long-term goals with target dates",
      "Visual progress tracking",
    ],
  },
  {
    icon: Mail,
    title: "Reports & Exports",
    description:
      "Generate detailed PDF reports of your financial activity. Get weekly email summaries delivered to your inbox.",
    bullets: [
      "Monthly PDF reports with charts",
      "AI-generated financial insights",
      "Weekly email summaries",
      "Export and share anytime",
    ],
  },
  {
    icon: Cpu,
    title: "MCP Server",
    description:
      "Connect Spendoza to AI assistants like Claude Desktop using the Model Context Protocol. Ask questions about your finances, create goals, and manage expenses — all through natural conversation.",
    bullets: [
      "Works with any MCP-compatible AI client",
      "Secure browser-based authentication",
      "Available on all plans — features match your tier",
      "Read and manage your financial data conversationally",
    ],
  },
  {
    icon: Users,
    title: "Household Finance",
    description:
      "Manage finances together. Create a shared household, see combined dashboards, and track each member's contributions.",
    bullets: [
      "Shared household dashboard",
      "Member contribution tracking",
      "Invite-based household management",
      "Household-level goals",
    ],
  },
];

export function AboutPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center gap-4 px-4 py-16 text-center md:py-24">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight md:text-5xl">
          Take control of your finances
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Spendoza is a personal and household finance tracker that helps you
          understand your spending, set goals, and make smarter financial
          decisions.
        </p>
        <div className="mt-4 flex gap-3">
          <Button asChild size="lg">
            <Link to="/signup">Get Started</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/pricing">View Plans</Link>
          </Button>
        </div>
      </section>

      {/* Feature sections */}
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-12">
        {features.map((feature, i) => {
          const Icon = feature.icon;
          const reversed = i % 2 === 1;
          return (
            <div
              key={feature.title}
              className={`flex flex-col items-center gap-8 md:flex-row ${reversed ? "md:flex-row-reverse" : ""}`}
            >
              <div className="flex flex-1 flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {feature.title}
                  </h2>
                </div>
                <p className="text-muted-foreground">{feature.description}</p>
                <ul className="flex flex-col gap-2">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-2 text-sm">
                      <Check className="size-4 shrink-0 text-green-600" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              <Card className="w-full flex-1 md:max-w-sm">
                <CardContent className="flex aspect-[4/3] items-center justify-center p-6">
                  <Icon className="size-16 text-muted-foreground/20" />
                </CardContent>
              </Card>
            </div>
          );
        })}
      </section>

      {/* CTA footer */}
      <section className="flex flex-col items-center gap-4 border-t bg-muted/30 px-4 py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          Ready to get started?
        </h2>
        <p className="text-muted-foreground">
          Join Spendoza and take the first step toward better finances.
        </p>
        <div className="mt-2 flex gap-3">
          <Button asChild size="lg">
            <Link to="/signup">Create Account</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/pricing">View Plans</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
