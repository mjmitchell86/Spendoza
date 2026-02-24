import { useState, useEffect, useRef } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePersonalDashboard, useGenerateReport } from "@/hooks/use-dashboard";
import { useBankStatements } from "@/hooks/use-bank-statements";
import { IncomeVsExpensesChart } from "@/components/dashboard/income-vs-expenses-chart";
import { SpendingByCategoryChart } from "@/components/dashboard/spending-by-category-chart";
import { SavingsRateCard } from "@/components/dashboard/savings-rate-card";
import { TopExpensesList } from "@/components/dashboard/top-expenses-list";
import { UpcomingBillsList } from "@/components/dashboard/upcoming-bills-list";
import { AiInsightsCard } from "@/components/dashboard/ai-insights-card";
import { cn } from "@/lib/utils";
import {
  TimePeriodFilter,
  getMonthParam,
  type TimePeriod,
} from "@/components/filters/time-period-filter";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function TrendBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isPositive ? "text-green-600" : "text-red-600"
      )}
    >
      <Icon className="size-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function DashboardPage() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("this_month");
  const month = getMonthParam(timePeriod);
  const { data, isLoading, error, refetch } = usePersonalDashboard(month);
  const generateReport = useGenerateReport();
  const { data: statements } = useBankStatements();
  const didAutoSwitch = useRef(false);

  // If "this_month" loads with zero data, auto-switch to "last_month"
  useEffect(() => {
    if (
      !didAutoSwitch.current &&
      !isLoading &&
      data &&
      timePeriod === "this_month" &&
      data.summary.total_income === 0 &&
      data.summary.total_expenses === 0
    ) {
      didAutoSwitch.current = true;
      setTimePeriod("last_month");
    }
  }, [data, isLoading, timePeriod]);

  const processingStatements = (statements ?? []).filter(
    (s) => s.status === "processing" || s.status === "uploaded"
  );

  // Refetch dashboard data when processing statements finish
  const prevProcessingCount = useRef(processingStatements.length);
  useEffect(() => {
    if (
      prevProcessingCount.current > 0 &&
      processingStatements.length < prevProcessingCount.current
    ) {
      void refetch();
    }
    prevProcessingCount.current = processingStatements.length;
  }, [processingStatements.length, refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <p className="text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Failed to load dashboard"}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Your personal financial overview
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <TimePeriodFilter value={timePeriod} onValueChange={setTimePeriod} />
          <Button
            variant="outline"
            onClick={() => generateReport.mutate()}
            disabled={generateReport.isPending}
          >
            <RefreshCw
              className={cn(
                "size-4",
                generateReport.isPending && "animate-spin"
              )}
            />
            {generateReport.isPending ? "Generating..." : "Refresh Report"}
          </Button>
        </div>
      </div>

      {/* Processing Banner */}
      {processingStatements.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3">
            <RefreshCw className="size-4 animate-spin text-primary" />
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <p className="text-sm">
                <span className="font-medium">
                  {processingStatements.length} statement{processingStatements.length > 1 ? "s" : ""}
                </span>{" "}
                currently processing. Dashboard will update once complete.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Total Income
              <TrendingUp className="size-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(data.summary.total_income)}
            </p>
            <TrendBadge value={data.trends.income_change} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Total Expenses
              <TrendingDown className="size-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(data.summary.total_expenses)}
            </p>
            <TrendBadge value={data.trends.expense_change} />
          </CardContent>
        </Card>

        <SavingsRateCard summary={data.summary} />

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Net
              <DollarSign className="size-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-2xl font-bold",
                data.summary.net >= 0 ? "text-green-600" : "text-red-600"
              )}
            >
              {formatCurrency(data.summary.net)}
            </p>
            <span className="text-xs text-muted-foreground">This month</span>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <IncomeVsExpensesChart summary={data.summary} />
        <SpendingByCategoryChart categories={data.by_category} />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <TopExpensesList categories={data.by_category} />
        <UpcomingBillsList />
        <AiInsightsCard insights={data.insights} insightsMonth={data.insights_month} />
      </div>
    </div>
  );
}
