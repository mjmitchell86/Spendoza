import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/hooks/use-dashboard";
import {
  formatSavingsRate,
  getSavingsRateTier,
  savingsRateArcFraction,
  type SavingsRateTier,
} from "@/lib/savings-rate";

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

const TIER_STYLES: Record<
  SavingsRateTier,
  { text: string; border: string; bg: string; stroke: string }
> = {
  good: { text: "text-emerald-500", border: "border-l-emerald-500", bg: "from-emerald-500/5", stroke: "#10b981" },
  fair: { text: "text-yellow-500", border: "border-l-yellow-500", bg: "from-yellow-500/5", stroke: "#eab308" },
  poor: { text: "text-rose-500", border: "border-l-rose-500", bg: "from-rose-500/5", stroke: "#f43f5e" },
};

function MiniArc({ ratePercent }: { ratePercent: number }) {
  const radius = 20;
  const circumference = Math.PI * radius; // semi-circle
  const progress = savingsRateArcFraction(ratePercent) * circumference;
  const stroke = TIER_STYLES[getSavingsRateTier(ratePercent)].stroke;

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
  // summary.savings_rate is already a percentage (0-100)
  const rate = summary.savings_rate;
  const tier = TIER_STYLES[getSavingsRateTier(rate)];

  return (
    <Card className={cn("border-l-4 bg-gradient-to-r to-transparent", tier.border, tier.bg)}>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Savings Rate
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <MiniArc ratePercent={rate} />
          <div>
            <p
              className={cn("text-3xl font-bold tracking-tight", tier.text)}
            >
              {formatSavingsRate(rate)}
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
