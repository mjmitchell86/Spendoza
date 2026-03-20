import { useState, useMemo } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { TransactionType } from "@spendoza/shared";
import {
  TimePeriodFilter,
  getDateRange,
} from "@/components/filters/time-period-filter";
import { useTimePeriod } from "@/hooks/use-time-period";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { useAllTransactions, useUpdateTransactionCategory } from "@/hooks/use-transactions";
import { useCategories } from "@/hooks/use-categories";
import { useDebts, useLinkTransactionToDebt } from "@/hooks/use-debts";

export function TransactionsPage() {
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">("all");
  const [search, setSearch] = useState("");
  const { timePeriod, setTimePeriod } = useTimePeriod();

  // Balance update dialog state
  const [balanceDialog, setBalanceDialog] = useState<{
    transactionId: string;
    debtId: string;
    debtName: string;
    currentBalance: number;
  } | null>(null);
  const [updateBalance, setUpdateBalance] = useState(false);
  const [newBalance, setNewBalance] = useState("");

  const dateRange = useMemo(() => getDateRange(timePeriod), [timePeriod]);
  const filters = useMemo(() => ({
    ...(typeFilter !== "all" ? { type: typeFilter as TransactionType } : {}),
    ...dateRange,
  }), [typeFilter, dateRange]);

  const { data: transactions, isLoading, error, refetch } = useAllTransactions(
    Object.keys(filters).length > 0 ? filters : undefined
  );
  const { data: categories } = useCategories();
  const { data: debts } = useDebts("user");
  const updateCategory = useUpdateTransactionCategory();
  const linkTransaction = useLinkTransactionToDebt();

  const filtered = (transactions ?? []).filter((txn) =>
    search
      ? txn.description.toLowerCase().includes(search.toLowerCase())
      : true
  );

  function handleCategoryChange(transactionId: string, category: string | null) {
    updateCategory.mutate({ transactionId, ai_category: category });
  }

  function handleDebtLink(transactionId: string, debtId: string | null) {
    if (!debtId) {
      // Unlinking — just do it directly
      linkTransaction.mutate({
        transaction_id: transactionId,
        debt_id: null,
      });
      return;
    }

    // Linking — show dialog to optionally update balance
    const debt = debts?.find((d) => d.id === debtId);
    if (debt) {
      setBalanceDialog({
        transactionId,
        debtId,
        debtName: debt.name,
        currentBalance: debt.current_balance,
      });
      setUpdateBalance(false);
      setNewBalance(debt.current_balance.toString());
    }
  }

  function handleBalanceDialogConfirm() {
    if (!balanceDialog) return;
    linkTransaction.mutate(
      {
        transaction_id: balanceDialog.transactionId,
        debt_id: balanceDialog.debtId,
        update_balance: updateBalance,
        new_balance: updateBalance ? parseFloat(newBalance) : undefined,
      },
      { onSuccess: () => setBalanceDialog(null) }
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          All transactions from your bank statements
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <TimePeriodFilter value={timePeriod} onValueChange={setTimePeriod} />
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search descriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 sm:w-[250px]"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as TransactionType | "all")}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="credit">Credits</SelectItem>
            <SelectItem value="debit">Debits</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle>
            Transactions{" "}
            {filtered.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({filtered.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <p className="text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : "Failed to load transactions"}
              </p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <TransactionTable
              transactions={filtered}
              categories={categories ?? []}
              onCategoryChange={handleCategoryChange}
              debts={debts}
              onDebtLink={handleDebtLink}
            />
          )}
        </CardContent>
      </Card>

      {/* Balance Update Dialog */}
      <Dialog
        open={!!balanceDialog}
        onOpenChange={(open) => {
          if (!open) setBalanceDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Link to {balanceDialog?.debtName}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This transaction will be linked as a payment for{" "}
            <strong>{balanceDialog?.debtName}</strong>.
          </p>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch
              id="update_balance"
              checked={updateBalance}
              onCheckedChange={setUpdateBalance}
            />
            <Label htmlFor="update_balance" className="cursor-pointer text-sm">
              Update current balance
            </Label>
          </div>

          {updateBalance && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="new_balance">
                New balance (currently{" "}
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(balanceDialog?.currentBalance ?? 0)}
                )
              </Label>
              <Input
                id="new_balance"
                type="number"
                step="0.01"
                min="0"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBalanceDialog(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBalanceDialogConfirm}
              disabled={linkTransaction.isPending}
            >
              {linkTransaction.isPending ? "Linking..." : "Link Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
