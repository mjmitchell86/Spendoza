import { useState, useMemo, useEffect } from "react";
import { Plus, RefreshCw, Search, TrendingDown, Hash, Layers, Crown } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import type { Expense } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExpenses } from "@/hooks/use-expenses";
import { useCategories } from "@/hooks/use-categories";
import { useAllTransactions, useUpdateTransactionCategory } from "@/hooks/use-transactions";
import {
  TimePeriodFilter,
  getDateRange,
  type TimePeriod,
} from "@/components/filters/time-period-filter";
import { useTimePeriod } from "@/hooks/use-time-period";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ExpenseList } from "@/components/expenses/expense-list";
import { TransactionTable } from "@/components/transactions/transaction-table";

const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#a855f7",
];

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

export function ExpensesPage() {
  const { data: expenses, isLoading, error, refetch } = useExpenses();
  const { data: categories } = useCategories();
  const updateCategory = useUpdateTransactionCategory();
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("__all__");
  const [merchantSearch, setMerchantSearch] = useState("");
  const { timePeriod, setTimePeriod, isExplicit } = useTimePeriod();

  const dateRange = useMemo(() => getDateRange(timePeriod), [timePeriod]);
  const { data: debitTransactions, isLoading: txLoading } = useAllTransactions({
    type: "debit",
    ...dateRange,
  });

  // On initial load (no explicit filter), auto-switch to last_month when
  // this_month has no data
  useEffect(() => {
    if (
      !isExplicit &&
      !txLoading &&
      debitTransactions &&
      timePeriod === "this_month" &&
      debitTransactions.length === 0
    ) {
      setTimePeriod("last_month");
    }
  }, [isExplicit, debitTransactions, txLoading, timePeriod, setTimePeriod]);

  // Apply both category and merchant filters
  const filteredTransactions = useMemo(() => {
    if (!debitTransactions) return [];
    let result = debitTransactions;

    if (selectedCategory !== "__all__") {
      result =
        selectedCategory === "__uncategorized__"
          ? result.filter((t) => !t.ai_category)
          : result.filter((t) => t.ai_category === selectedCategory);
    }

    if (merchantSearch) {
      const q = merchantSearch.toLowerCase();
      result = result.filter((t) => t.description.toLowerCase().includes(q));
    }

    return result;
  }, [debitTransactions, selectedCategory, merchantSearch]);

  // Charts react to filtered data
  const categoryBreakdown = useMemo(() => {
    if (filteredTransactions.length === 0) return [];

    const totals = new Map<string, number>();
    let grandTotal = 0;

    for (const txn of filteredTransactions) {
      const cat = txn.ai_category ?? "Uncategorized";
      totals.set(cat, (totals.get(cat) ?? 0) + txn.amount);
      grandTotal += txn.amount;
    }

    return Array.from(totals.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: grandTotal > 0 ? (amount / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions]);

  const topMerchants = useMemo(() => {
    if (filteredTransactions.length === 0) return [];

    const totals = new Map<string, number>();
    for (const txn of filteredTransactions) {
      totals.set(txn.description, (totals.get(txn.description) ?? 0) + txn.amount);
    }

    return Array.from(totals.entries())
      .map(([merchant, amount]) => ({ merchant, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 7);
  }, [filteredTransactions]);

  // Summary stats from filtered data
  const totalExpenses = useMemo(
    () => filteredTransactions.reduce((sum, t) => sum + t.amount, 0),
    [filteredTransactions]
  );

  const avgTransaction = useMemo(
    () => (filteredTransactions.length > 0 ? totalExpenses / filteredTransactions.length : 0),
    [filteredTransactions, totalExpenses]
  );

  const topCategory = useMemo(
    () => (categoryBreakdown.length > 0 ? categoryBreakdown[0].category : "N/A"),
    [categoryBreakdown]
  );

  const uniqueCategories = useMemo(() => {
    if (!debitTransactions) return [];
    const cats = new Set<string>();
    for (const txn of debitTransactions) {
      if (txn.ai_category) cats.add(txn.ai_category);
    }
    return Array.from(cats).sort();
  }, [debitTransactions]);

  const categoryTotal = useMemo(
    () => categoryBreakdown.reduce((sum, c) => sum + c.amount, 0),
    [categoryBreakdown]
  );

  function handleEdit(expense: Expense) {
    setEditingExpense(expense);
    setFormOpen(true);
  }

  function handleFormClose(open: boolean) {
    setFormOpen(open);
    if (!open) setEditingExpense(null);
  }

  const hasTransactions = debitTransactions && debitTransactions.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            {formatPeriodLabel(timePeriod) || "Track and manage your expenses"}
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Add Expense
        </Button>
      </div>

      {/* Summary Cards */}
      {hasTransactions && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-rose-500 bg-gradient-to-r from-rose-500/5 to-transparent">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Total Expenses
                <TrendingDown className="size-4 text-rose-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight text-rose-500">
                {formatCurrency(totalExpenses)}
              </p>
              <span className="text-xs text-muted-foreground">
                {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? "s" : ""}
              </span>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary bg-gradient-to-r from-primary/5 to-transparent">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Avg Transaction
                <Hash className="size-4 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight">
                {formatCurrency(avgTransaction)}
              </p>
              <span className="text-xs text-muted-foreground">Per debit</span>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-violet-500 bg-gradient-to-r from-violet-500/5 to-transparent">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Categories
                <Layers className="size-4 text-violet-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight">
                {categoryBreakdown.length}
              </p>
              <span className="text-xs text-muted-foreground">Active categories</span>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-500/5 to-transparent">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Top Category
                <Crown className="size-4 text-amber-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="truncate text-3xl font-bold tracking-tight">{topCategory}</p>
              {categoryBreakdown.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {categoryBreakdown[0].percentage.toFixed(0)}% of total
                </span>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter Bar — always visible so user can change time period */}
      <div className="flex flex-wrap items-center gap-3">
        <TimePeriodFilter value={timePeriod} onValueChange={setTimePeriod} />
        {hasTransactions && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search merchants..."
                value={merchantSearch}
                onChange={(e) => setMerchantSearch(e.target.value)}
                className="w-full pl-9 sm:w-[220px]"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Categories</SelectItem>
                <SelectItem value="__uncategorized__">Uncategorized</SelectItem>
                {uniqueCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(selectedCategory !== "__all__" || merchantSearch) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedCategory("__all__");
                  setMerchantSearch("");
                }}
              >
                Clear filters
              </Button>
            )}
          </>
        )}
      </div>

      {/* Charts Row — react to filters */}
      {categoryBreakdown.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle>By Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center gap-4">
                <div className="relative h-full w-1/2 min-w-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={50}
                        paddingAngle={2}
                        label={false}
                      >
                        {categoryBreakdown.map((_entry, index) => (
                          <Cell
                            key={index}
                            fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          formatCurrency(value),
                          name,
                        ]}
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid hsl(var(--border))",
                          backgroundColor: "hsl(var(--card))",
                          color: "hsl(var(--foreground))",
                          fontSize: "13px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-lg font-bold">{formatCurrency(categoryTotal)}</p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
                  {categoryBreakdown.map((cat, index) => (
                    <div key={cat.category} className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                      />
                      <span className="flex-1 truncate text-muted-foreground">{cat.category}</span>
                      <span className="shrink-0 font-medium">{formatCurrency(cat.amount)}</span>
                      <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">
                        {cat.percentage.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle>Top Merchants</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topMerchants}
                    layout="vertical"
                    margin={{ top: 8, right: 60, left: 0, bottom: 0 }}
                  >
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => formatCurrency(v)}
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      axisLine={{ stroke: "hsl(var(--border))" }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="merchant"
                      width={80}
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) =>
                        v.length > 18 ? v.slice(0, 18) + "..." : v
                      }
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), "Amount"]}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid hsl(var(--border))",
                        backgroundColor: "hsl(var(--card))",
                        color: "hsl(var(--foreground))",
                        fontSize: "13px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <defs>
                      <linearGradient id="expBarGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <Bar
                      dataKey="amount"
                      fill="url(#expBarGrad)"
                      radius={[0, 6, 6, 0]}
                      barSize={22}
                    >
                      <LabelList
                        dataKey="amount"
                        position="right"
                        formatter={(v: number) => formatCurrency(v)}
                        className="fill-muted-foreground text-[10px]"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Manual Expense Entries */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Recurring Expenses</CardTitle>
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
                  : "Failed to load expenses"}
              </p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <ExpenseList
              expenses={expenses ?? []}
              categories={categories ?? []}
              onEdit={handleEdit}
            />
          )}
        </CardContent>
      </Card>

      {/* Bank Transactions Table */}
      {hasTransactions && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>
              Bank Transactions{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({filteredTransactions.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionTable
              transactions={filteredTransactions}
              categories={categories ?? []}
              onCategoryChange={(id, cat) =>
                updateCategory.mutate({ transactionId: id, ai_category: cat })
              }
              showTypeColumn={false}
            />
          </CardContent>
        </Card>
      )}

      <ExpenseForm
        open={formOpen}
        onOpenChange={handleFormClose}
        expense={editingExpense}
        categories={categories ?? []}
      />
    </div>
  );
}
