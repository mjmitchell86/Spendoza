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
  if (score >= 80) return "text-emerald-500";
  if (score >= 50) return "text-yellow-500";
  return "text-rose-500";
}

function getScoreStroke(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 50) return "#eab308";
  return "#f43f5e";
}

function getRatingColor(rating: string): string {
  switch (rating) {
    case "good":
      return "bg-emerald-500";
    case "ok":
      return "bg-blue-500";
    case "warning":
      return "bg-yellow-500";
    case "critical":
      return "bg-rose-500";
    default:
      return "bg-gray-400";
  }
}

function getRatingBarWidth(rating: string): string {
  switch (rating) {
    case "good":
      return "w-full";
    case "ok":
      return "w-3/4";
    case "warning":
      return "w-1/2";
    case "critical":
      return "w-1/4";
    default:
      return "w-0";
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
      <span className="inline-flex items-center gap-0.5 text-sm font-medium text-emerald-500">
        <ArrowUpRight className="size-4" />
      </span>
    );
  }
  if (score < previousScore) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-medium text-rose-500">
        <ArrowDownRight className="size-4" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-sm font-medium text-muted-foreground">
      <ArrowRight className="size-4" />
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const strokeColor = getScoreStroke(score);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-700"
        />
      </svg>
      <span className={cn("absolute text-2xl font-bold", getScoreColor(score))}>
        {score}
      </span>
    </div>
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
        <div className="flex items-center gap-3">
          <ScoreRing score={score} />
          <TrendArrow score={score} previousScore={previousScore} />
        </div>

        <ul className="mt-3 space-y-1.5">
          {Object.entries(factors).map(([key, { rating }]) => (
            <li key={key} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground">
                {FACTOR_LABELS[key] ?? key}
              </span>
              <div className="h-1.5 flex-1 rounded-full bg-muted">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    getRatingColor(rating),
                    getRatingBarWidth(rating)
                  )}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
