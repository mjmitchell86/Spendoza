import { useState, useMemo } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { TransactionType } from "@spendoza/shared";
import {
  TimePeriodFilter,
  getDateRange,
  type TimePeriod,
} from "@/components/filters/time-period-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { useAllTransactions, useUpdateTransactionCategory } from "@/hooks/use-transactions";
import { useCategories } from "@/hooks/use-categories";

export function TransactionsPage() {
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">("all");
  const [search, setSearch] = useState("");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("this_month");

  const dateRange = useMemo(() => getDateRange(timePeriod), [timePeriod]);
  const filters = useMemo(() => ({
    ...(typeFilter !== "all" ? { type: typeFilter as TransactionType } : {}),
    ...dateRange,
  }), [typeFilter, dateRange]);

  const { data: transactions, isLoading, error, refetch } = useAllTransactions(
    Object.keys(filters).length > 0 ? filters : undefined
  );
  const { data: categories } = useCategories();
  const updateCategory = useUpdateTransactionCategory();

  const filtered = (transactions ?? []).filter((txn) =>
    search
      ? txn.description.toLowerCase().includes(search.toLowerCase())
      : true
  );

  function handleCategoryChange(transactionId: string, category: string | null) {
    updateCategory.mutate({ transactionId, ai_category: category });
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
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
