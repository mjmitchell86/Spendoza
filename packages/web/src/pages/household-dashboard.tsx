import { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  LogOut,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useHouseholdDashboard,
  useGenerateReport,
} from "@/hooks/use-dashboard";
import { useExportHouseholdReport } from "@/hooks/use-export-report";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useHousehold, useLeaveHousehold } from "@/hooks/use-household";
import { IncomeVsExpensesChart } from "@/components/dashboard/income-vs-expenses-chart";
import { SpendingByCategoryChart } from "@/components/dashboard/spending-by-category-chart";
import { SavingsRateCard } from "@/components/dashboard/savings-rate-card";
import { TopExpensesList } from "@/components/dashboard/top-expenses-list";
import { AiInsightsCard } from "@/components/dashboard/ai-insights-card";
import { CreateHousehold } from "@/components/household/create-household";
import { JoinHousehold } from "@/components/household/join-household";
import { MemberList } from "@/components/household/member-list";
import { InviteForm } from "@/components/household/invite-form";
import { SharingConfig } from "@/components/household/sharing-config";
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

export function HouseholdPage() {
  const { user } = useAuth();
  const { data: householdData, isLoading: householdLoading, error: householdError, refetch: refetchHousehold } = useHousehold();
  const hasHousehold = !!householdData?.household;
  const { data, isLoading, error, refetch } = useHouseholdDashboard(undefined, hasHousehold);
  const generateReport = useGenerateReport();
  const exportHouseholdReport = useExportHouseholdReport();

  const leaveHousehold = useLeaveHousehold();
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const household = householdData?.household;
  const members = householdData?.members ?? [];
  const currentUserId = user?.id ?? "";
  const isHead = household?.head_of_household_id === currentUserId;
  const isSoleMember = members.length <= 1;
  const canLeave = !isHead || isSoleMember;
  const currentMember = members.find((m) => m.id === currentUserId);

  async function handleLeave() {
    try {
      await leaveHousehold.mutateAsync();
      setShowLeaveDialog(false);
    } catch {
      // Error handled by mutation
    }
  }

  // Loading state
  if (householdLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (householdError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <p className="text-sm text-destructive">
          {householdError instanceof Error
            ? householdError.message
            : "Failed to load household"}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetchHousehold()}>
          Retry
        </Button>
      </div>
    );
  }

  // No household — show create/join
  if (!household) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Household</h1>
          <p className="text-sm text-muted-foreground">
            Create or join a household to share finances with your family
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <CreateHousehold />
          <JoinHousehold />
        </div>
      </div>
    );
  }

  // Has household — show tabbed view
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Household</h1>
        <p className="text-sm text-muted-foreground">
          {household.name} — financial overview and settings
        </p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
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
          ) : !data ? null : (
            <div className="flex flex-col gap-6">
              {/* Refresh button */}
              <div className="flex justify-end gap-2">
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
                <Button
                  variant="outline"
                  onClick={() => exportHouseholdReport.mutate(data?.month)}
                  disabled={exportHouseholdReport.isPending}
                >
                  <Download className="size-4" />
                  {exportHouseholdReport.isPending ? "Exporting..." : "Export PDF"}
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
                    <span className="text-xs text-muted-foreground">
                      {data.month
                        ? new Date(data.month + "T00:00:00Z").toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          })
                        : "This month"}
                    </span>
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
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="flex flex-col gap-6">
            {/* Members */}
            <Card>
              <CardHeader className="pb-0">
                <CardTitle>Members</CardTitle>
              </CardHeader>
              <CardContent>
                <MemberList
                  members={members}
                  headId={household.head_of_household_id}
                  currentUserId={currentUserId}
                  isHead={isHead}
                />
              </CardContent>
            </Card>

            {/* Invite (head only) */}
            {isHead && (
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle>Invite Members</CardTitle>
                </CardHeader>
                <CardContent>
                  <InviteForm inviteCode={household.invite_code} />
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Sharing Config */}
            {currentMember && (
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle>Your Sharing Preferences</CardTitle>
                </CardHeader>
                <CardContent>
                  <SharingConfig
                    currentIncomeMode={currentMember.income_sharing_mode}
                    currentExpenseMode={currentMember.expense_sharing_mode}
                    currentSharedAmount={null}
                  />
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Danger Zone */}
            <Card className="border-destructive/50">
              <CardHeader className="pb-0">
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {isHead && isSoleMember
                        ? "Leave & Delete Household"
                        : "Leave Household"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isHead && !isSoleMember
                        ? "Transfer ownership before leaving"
                        : isHead && isSoleMember
                          ? "This will permanently delete the household"
                          : "You will be removed from this household"}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    disabled={!canLeave}
                    onClick={() => setShowLeaveDialog(true)}
                  >
                    <LogOut className="size-4" />
                    {isHead && isSoleMember
                      ? "Leave & Delete"
                      : "Leave Household"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {isHead && isSoleMember
                      ? "Leave & Delete Household"
                      : "Leave Household"}
                  </DialogTitle>
                  <DialogDescription>
                    {isHead && isSoleMember
                      ? `Are you sure you want to leave ${household.name}? Since you are the only member, the household will be permanently deleted.`
                      : `Are you sure you want to leave ${household.name}?`}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowLeaveDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleLeave}
                    disabled={leaveHousehold.isPending}
                  >
                    {leaveHousehold.isPending ? "Leaving..." : "Leave"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
