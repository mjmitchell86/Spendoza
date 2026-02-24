import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useHouseholdDashboard,
  useGenerateReport,
} from "@/hooks/use-dashboard";
import { useHousehold } from "@/hooks/use-household";
import { IncomeVsExpensesChart } from "@/components/dashboard/income-vs-expenses-chart";
import { SpendingByCategoryChart } from "@/components/dashboard/spending-by-category-chart";
import { SavingsRateCard } from "@/components/dashboard/savings-rate-card";
import { TopExpensesList } from "@/components/dashboard/top-expenses-list";
import { AiInsightsCard } from "@/components/dashboard/ai-insights-card";
import { cn } from "@/lib/utils";
import type { MemberContribution } from "@/hooks/use-dashboard";

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

function MemberContributions({
  contributions,
}: {
  contributions: MemberContribution[];
}) {
  const maxIncome = Math.max(...contributions.map((c) => c.income), 1);

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4" />
          Member Contributions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {contributions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No contribution data available
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {contributions.map((member) => {
              const incomeWidth = (member.income / maxIncome) * 100;
              return (
                <div key={member.user_id} className="flex flex-col gap-1.5">
                  <div className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium">{member.display_name}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(member.income)} income /{" "}
                      {formatCurrency(member.expenses)} expenses
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <div className="h-2 flex-1 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-green-500 transition-all"
                        style={{ width: `${incomeWidth}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HouseholdDashboardPage() {
  const { data: household, isLoading: householdLoading } = useHousehold();
  const hasHousehold = !!household?.household;
  const { data, isLoading, error, refetch } = useHouseholdDashboard(undefined, hasHousehold);
  const generateReport = useGenerateReport();

  // If no household, show prompt
  if (!householdLoading && !household?.household) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Users className="size-12 text-muted-foreground" />
        <div className="text-center">
          <h2 className="text-lg font-semibold">No Household</h2>
          <p className="text-sm text-muted-foreground">
            Create or join a household to see the household dashboard.
          </p>
        </div>
        <Button asChild>
          <Link to="/household">Go to Household</Link>
        </Button>
      </div>
    );
  }

  if (isLoading || householdLoading) {
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
            : "Failed to load household dashboard"}
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Household Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {household?.household.name ?? "Household"} financial overview
          </p>
        </div>
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

      {/* Member Contributions */}
      <MemberContributions contributions={data.member_contributions ?? []} />

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <IncomeVsExpensesChart summary={data.summary} />
        <SpendingByCategoryChart categories={data.by_category} />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopExpensesList categories={data.by_category} />
        <AiInsightsCard insights={data.insights} insightsMonth={data.insights_month} />
      </div>
    </div>
  );
}
