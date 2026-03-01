import { useState } from "react";
import { Plus, RefreshCw, DollarSign, Percent, CreditCard } from "lucide-react";
import type { Debt } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDebts, useDeleteDebt } from "@/hooks/use-debts";
import { DebtCard } from "@/components/debts/debt-card";
import { DebtForm } from "@/components/debts/debt-form";
import { PayoffProjections } from "@/components/debts/payoff-projections";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { useProfile } from "@/hooks/use-profile";
import { formatCurrency } from "@/components/goals/goal-card";

export function DebtsPage() {
  const { data: profile } = useProfile();
  const { data: debts, isLoading, error, refetch } = useDebts("user");
  const [formOpen, setFormOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const deleteDebt = useDeleteDebt();

  if (profile && profile.subscription_tier === "free") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Debts</h1>
          <p className="text-sm text-muted-foreground">
            Track and pay off your debts faster
          </p>
        </div>
        <UpgradePrompt feature="Debts" requiredTier="Starter" />
      </div>
    );
  }

  const debtList = debts ?? [];

  // Summary calculations
  const totalBalance = debtList.reduce((sum, d) => sum + d.current_balance, 0);
  const totalMinPayments = debtList.reduce(
    (sum, d) => sum + d.minimum_payment,
    0
  );
  const highestRate =
    debtList.length > 0 ? Math.max(...debtList.map((d) => d.interest_rate)) : 0;

  function handleEdit(debt: Debt) {
    setEditingDebt(debt);
    setFormOpen(true);
  }

  function handleFormClose(open: boolean) {
    setFormOpen(open);
    if (!open) setEditingDebt(null);
  }

  function handleDelete(id: string) {
    if (confirm("Delete this debt?")) {
      deleteDebt.mutate(id);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Debts</h1>
          <p className="text-sm text-muted-foreground">
            Track and pay off your debts faster
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Add Debt
        </Button>
      </div>

      {/* Summary Cards */}
      {debtList.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Total Debt Balance
                <DollarSign className="size-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(totalBalance)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Monthly Payments
                <CreditCard className="size-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(totalMinPayments)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Highest Rate
                <Percent className="size-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">
                {highestRate.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Debts List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load debts"}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : debtList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
            <CreditCard className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No debts tracked yet. Add your debts to see payoff strategies.
            </p>
            <Button variant="outline" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              Add Your First Debt
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {debtList.map((debt) => (
              <DebtCard
                key={debt.id}
                debt={debt}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Payoff Projections */}
          <PayoffProjections entityType="user" />
        </>
      )}

      {/* Form Dialog */}
      <DebtForm
        key={editingDebt?.id ?? "new"}
        open={formOpen}
        onOpenChange={handleFormClose}
        debt={editingDebt}
      />
    </div>
  );
}
