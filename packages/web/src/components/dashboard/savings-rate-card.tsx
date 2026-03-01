import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/hooks/use-dashboard";

interface SavingsRateCardProps {
  summary: DashboardSummary;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getRateColor(rate: number): string {
  if (rate >= 0.2) return "text-emerald-500";
  if (rate >= 0.05) return "text-yellow-500";
  return "text-rose-500";
}

function getRateAccent(rate: number) {
  if (rate >= 0.2) return { border: "border-l-emerald-500", bg: "from-emerald-500/5" };
  if (rate >= 0.05) return { border: "border-l-yellow-500", bg: "from-yellow-500/5" };
  return { border: "border-l-rose-500", bg: "from-rose-500/5" };
}

function getArcStroke(rate: number): string {
  if (rate >= 0.2) return "#10b981";
  if (rate >= 0.05) return "#eab308";
  return "#f43f5e";
}

function MiniArc({ rate }: { rate: number }) {
  const clamped = Math.max(0, Math.min(1, rate));
  const radius = 20;
  const circumference = Math.PI * radius; // semi-circle
  const progress = clamped * circumference;
  const stroke = getArcStroke(rate);

  return (
    <svg width="48" height="28" className="shrink-0">
      <path
        d="M 4 24 A 20 20 0 0 1 44 24"
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M 4 24 A 20 20 0 0 1 44 24"
        fill="none"
        stroke={stroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        className="transition-all duration-500"
      />
    </svg>
  );
}

export function SavingsRateCard({ summary }: SavingsRateCardProps) {
  const ratePercent = (summary.savings_rate * 100).toFixed(1);
  const accent = getRateAccent(summary.savings_rate);

  return (
    <Card className={cn("border-l-4 bg-gradient-to-r to-transparent", accent.border, accent.bg)}>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Savings Rate
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <MiniArc rate={summary.savings_rate} />
          <div>
            <p
              className={cn(
                "text-3xl font-bold tracking-tight",
                getRateColor(summary.savings_rate)
              )}
            >
              {ratePercent}%
            </p>
            <p className="text-sm text-muted-foreground">
              Net: {formatCurrency(summary.net)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
