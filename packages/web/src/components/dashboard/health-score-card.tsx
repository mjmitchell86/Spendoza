import { ArrowUpRight, ArrowDownRight, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HealthScoreCardProps {
  score: number;
  previousScore: number | null;
  factors: {
    savings_rate: { rating: string };
    needs_ratio: { rating: string };
    wants_ratio: { rating: string };
    emergency_fund: { rating: string };
    debt_to_income: { rating: string };
  };
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

function getRatingDotColor(rating: string): string {
  switch (rating) {
    case "good":
      return "bg-green-500";
    case "ok":
      return "bg-blue-500";
    case "warning":
      return "bg-yellow-500";
    case "critical":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

const FACTOR_LABELS: Record<string, string> = {
  savings_rate: "Savings Rate",
  needs_ratio: "Needs Ratio",
  wants_ratio: "Wants Ratio",
  emergency_fund: "Emergency Fund",
  debt_to_income: "Debt-to-Income",
};

function TrendArrow({ score, previousScore }: { score: number; previousScore: number | null }) {
  if (previousScore === null) return null;

  if (score > previousScore) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-medium text-green-600">
        <ArrowUpRight className="size-4" />
      </span>
    );
  }
  if (score < previousScore) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-medium text-red-600">
        <ArrowDownRight className="size-4" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-sm font-medium text-gray-500">
      <ArrowRight className="size-4" />
    </span>
  );
}

export function HealthScoreCard({ score, previousScore, factors }: HealthScoreCardProps) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Health Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-1">
          <span className={cn("text-3xl font-bold tracking-tight", getScoreColor(score))}>
            {score}
          </span>
          <span className="text-sm text-muted-foreground">/100</span>
          <TrendArrow score={score} previousScore={previousScore} />
        </div>

        <ul className="mt-3 space-y-1">
          {Object.entries(factors).map(([key, { rating }]) => (
            <li key={key} className="flex items-center gap-2 text-xs">
              <span className={cn("size-2 shrink-0 rounded-full", getRatingDotColor(rating))} />
              <span className="text-muted-foreground">
                {FACTOR_LABELS[key] ?? key}
              </span>
              <span className="ml-auto capitalize text-muted-foreground">{rating}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
