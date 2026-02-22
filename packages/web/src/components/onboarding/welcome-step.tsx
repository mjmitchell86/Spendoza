import { Wallet, BarChart3, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onNext: () => void;
}

const features = [
  {
    icon: Wallet,
    title: "Track Finances",
    description: "Manage income, expenses, and bank statements in one place",
  },
  {
    icon: BarChart3,
    title: "Visual Insights",
    description:
      "See where your money goes with charts and dashboards",
  },
  {
    icon: Users,
    title: "Household Sharing",
    description: "Share and manage finances with your family",
  },
  {
    icon: Sparkles,
    title: "AI-Powered",
    description:
      "Automatic bank statement parsing and personalized insights",
  },
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome to Spendoza
        </h1>
        <p className="text-muted-foreground">
          Your personal finance tracker. Let's get you set up in just a few
          steps.
        </p>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-2">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="flex flex-col items-center gap-2 rounded-lg border p-4"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                <Icon className="size-5 text-primary" />
              </div>
              <p className="text-sm font-medium">{feature.title}</p>
              <p className="text-xs text-muted-foreground">
                {feature.description}
              </p>
            </div>
          );
        })}
      </div>

      <Button size="lg" onClick={onNext}>
        Get Started
      </Button>
    </div>
  );
}
