import { useEffect, useRef } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePersonalDashboard, useGenerateReport } from "@/hooks/use-dashboard";
import { useExportPersonalReport } from "@/hooks/use-export-report";
import { useBankStatements } from "@/hooks/use-bank-statements";
import { IncomeVsExpensesChart } from "@/components/dashboard/income-vs-expenses-chart";
import { SpendingByCategoryChart } from "@/components/dashboard/spending-by-category-chart";
import { SavingsRateCard } from "@/components/dashboard/savings-rate-card";
import { HealthScoreCard } from "@/components/dashboard/health-score-card";
import { AllocationBar } from "@/components/dashboard/allocation-bar";
import { TopExpensesList } from "@/components/dashboard/top-expenses-list";
import { UpcomingBillsList } from "@/components/dashboard/upcoming-bills-list";
import { AiInsightsCard } from "@/components/dashboard/ai-insights-card";
import { cn } from "@/lib/utils";
import {
  TimePeriodFilter,
  getMonthParam,
  getDateRange,
  type TimePeriod,
} from "@/components/filters/time-period-filter";
import { useTimePeriod } from "@/hooks/use-time-period";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPeriodLabel(period: TimePeriod): string {
  const fmt = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00Z");
    return d.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  if (period.startsWith("month:")) {
    return fmt(period.slice(6) + "-01");
  }

  const range = getDateRange(period);

  switch (period) {
    case "this_month":
    case "last_month":
      return range.from_date ? fmt(range.from_date) : "";
    case "last_3_months":
      return range.from_date && range.to_date
        ? `${fmt(range.from_date)} – ${fmt(range.to_date)}`
        : "";
    case "this_year":
    case "last_year":
      return range.from_date ? range.from_date.slice(0, 4) : "";
    case "all_time":
      return "All Time";
    default:
      return "";
  }
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
  const { timePeriod, setTimePeriod, isExplicit } = useTimePeriod();
  const month = getMonthParam(timePeriod);
  const { data, isLoading, error, refetch } = usePersonalDashboard(month);
  const generateReport = useGenerateReport();
  const exportReport = useExportPersonalReport();
  const { data: statements } = useBankStatements();

  // On initial load (no explicit filter), auto-switch to the latest month
  // with transactions if the current month has none.
  useEffect(() => {
    if (
      !isExplicit &&
      !isLoading &&
      data &&
      data.has_transactions === false &&
      data.latest_transaction_month
    ) {
      setTimePeriod(
        `month:${data.latest_transaction_month.slice(0, 7)}`
      );
    }
  }, [isExplicit, isLoading, data, setTimePeriod]);

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
            {formatPeriodLabel(timePeriod)}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <TimePeriodFilter value={timePeriod} onValueChange={setTimePeriod} />
          <Button
            variant="outline"
            onClick={() => generateReport.mutate()}
            disabled={generateReport.isPending || data.has_transactions === false}
            title={data.has_transactions === false ? "No transactions for this period" : undefined}
          >
            <RefreshCw
              className={cn(
                "size-4",
                generateReport.isPending && "animate-spin"
              )}
            />
            {generateReport.isPending ? "Generating..." : "Refresh Report"}
          </Button>
          <Button
            variant="outline"
            onClick={() => exportReport.mutate(data?.month ?? month)}
            disabled={exportReport.isPending}
          >
            <Download className="size-4" />
            {exportReport.isPending ? "Exporting..." : "Export PDF"}
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
            <span className="text-xs text-muted-foreground">
              {timePeriod === "this_month" ? "This month" : formatPeriodLabel(timePeriod)}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Health Score */}
      {data.financial_health_score && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HealthScoreCard
            score={data.financial_health_score.score}
            previousScore={data.financial_health_score.previous_score}
            factors={data.financial_health_score.factors}
          />
          {data.allocation && (
            <div className="sm:col-span-2 lg:col-span-3">
              <AllocationBar allocation={data.allocation} />
            </div>
          )}
        </div>
      )}

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
