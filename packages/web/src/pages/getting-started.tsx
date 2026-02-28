import { Link } from "react-router-dom";
import {
  UserPlus,
  Upload,
  Search,
  LayoutDashboard,
  Target,
  Users,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const steps = [
  {
    icon: UserPlus,
    title: "Create Your Account",
    description:
      "Sign up with an invite code to get started. Don't have one? Join the waitlist and we'll get you in soon.",
  },
  {
    icon: Upload,
    title: "Upload Your First Statement",
    description:
      "Upload a PDF bank statement during onboarding. Spendoza extracts your transactions automatically. You can also skip this and add transactions manually.",
  },
  {
    icon: Search,
    title: "Review Transactions",
    description:
      "AI categorizes your transactions for you. Review the results and adjust any categories that need fixing.",
  },
  {
    icon: LayoutDashboard,
    title: "Explore Your Dashboard",
    description:
      "See your spending breakdown, income vs. expenses chart, savings rate, and month-over-month trends all in one place.",
  },
  {
    icon: Target,
    title: "Set Goals",
    tier: "Starter",
    description:
      "Create budget goals per category, set monthly savings targets, or plan long-term savings goals with target dates. Track your progress visually.",
  },
  {
    icon: Users,
    title: "Invite Your Household",
    tier: "Pro",
    description:
      "Share finances with family members. Create a household, invite others with a code, and see a combined dashboard with everyone's contributions.",
  },
  {
    icon: FileText,
    title: "Get Reports",
    tier: "Starter",
    description:
      "Export detailed PDF reports with charts and AI insights. Enable weekly email summaries to stay on top of your finances without logging in.",
  },
];

export function GettingStartedPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Getting Started</h1>
        <p className="max-w-lg text-muted-foreground">
          Here's how to get up and running with Spendoza in a few simple steps.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <Card key={step.title}>
              <CardContent className="flex items-start gap-4 p-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  {i + 1}
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <h3 className="font-semibold">{step.title}</h3>
                    {step.tier && (
                      <Badge variant="secondary" className="text-xs">
                        {step.tier}+
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground">
          Ready to try it out?
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link to="/signup">Create Account</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/pricing">View Plans</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
