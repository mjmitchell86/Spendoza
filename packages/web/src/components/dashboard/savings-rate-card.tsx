import { TrendingUp, TrendingDown, Minus } from "lucide-react";
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
  if (rate >= 0.2) return "text-green-600";
  if (rate >= 0.05) return "text-yellow-600";
  return "text-red-600";
}

function getRateBgColor(rate: number): string {
  if (rate >= 0.2) return "bg-green-50";
  if (rate >= 0.05) return "bg-yellow-50";
  return "bg-red-50";
}

function getRateIcon(rate: number) {
  if (rate >= 0.05) return TrendingUp;
  if (rate > -0.05) return Minus;
  return TrendingDown;
}

export function SavingsRateCard({ summary }: SavingsRateCardProps) {
  const ratePercent = (summary.savings_rate * 100).toFixed(1);
  const Icon = getRateIcon(summary.savings_rate);

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle>Savings Rate</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-12 items-center justify-center rounded-full",
              getRateBgColor(summary.savings_rate)
            )}
          >
            <Icon
              className={cn("size-6", getRateColor(summary.savings_rate))}
            />
          </div>
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
