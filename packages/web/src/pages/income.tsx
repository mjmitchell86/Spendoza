import { useState, useMemo } from "react";
import { Plus, RefreshCw, Search, TrendingUp, Hash, Layers, Crown } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { IncomeEntry } from "@spendoza/shared";
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
import { useIncome } from "@/hooks/use-income";
import { useHousehold } from "@/hooks/use-household";
import { useCategories } from "@/hooks/use-categories";
import { useAllTransactions, useUpdateTransactionCategory } from "@/hooks/use-transactions";
import {
  TimePeriodFilter,
  getDateRange,
  type TimePeriod,
} from "@/components/filters/time-period-filter";
import { IncomeForm } from "@/components/income/income-form";
import { IncomeList } from "@/components/income/income-list";
import { TransactionTable } from "@/components/transactions/transaction-table";

const CATEGORY_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
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

export function IncomePage() {
  const { data: entries, isLoading, error, refetch } = useIncome();
  const { data: household } = useHousehold();
  const { data: categories } = useCategories();
  const updateCategory = useUpdateTransactionCategory();
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<IncomeEntry | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("__all__");
  const [merchantSearch, setMerchantSearch] = useState("");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("this_month");

  const dateRange = useMemo(() => getDateRange(timePeriod), [timePeriod]);
  const { data: creditTransactions } = useAllTransactions({
    type: "credit",
    ...dateRange,
  });

  // Apply both category and merchant filters
  const filteredTransactions = useMemo(() => {
    if (!creditTransactions) return [];
    let result = creditTransactions;

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
  }, [creditTransactions, selectedCategory, merchantSearch]);

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

  const topSources = useMemo(() => {
    if (filteredTransactions.length === 0) return [];

    const totals = new Map<string, number>();
    for (const txn of filteredTransactions) {
      totals.set(txn.description, (totals.get(txn.description) ?? 0) + txn.amount);
    }

    return Array.from(totals.entries())
      .map(([source, amount]) => ({ source, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 7);
  }, [filteredTransactions]);

  // Summary stats from filtered data
  const totalIncome = useMemo(
    () => filteredTransactions.reduce((sum, t) => sum + t.amount, 0),
    [filteredTransactions]
  );

  const avgTransaction = useMemo(
    () => (filteredTransactions.length > 0 ? totalIncome / filteredTransactions.length : 0),
    [filteredTransactions, totalIncome]
  );

  const topCategory = useMemo(
    () => (categoryBreakdown.length > 0 ? categoryBreakdown[0].category : "N/A"),
    [categoryBreakdown]
  );

  const uniqueCategories = useMemo(() => {
    if (!creditTransactions) return [];
    const cats = new Set<string>();
    for (const txn of creditTransactions) {
      if (txn.ai_category) cats.add(txn.ai_category);
    }
    return Array.from(cats).sort();
  }, [creditTransactions]);

  function handleEdit(entry: IncomeEntry) {
    setEditingEntry(entry);
    setFormOpen(true);
  }

  function handleFormClose(open: boolean) {
    setFormOpen(open);
    if (!open) setEditingEntry(null);
  }

  const hasTransactions = creditTransactions && creditTransactions.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Income</h1>
          <p className="text-sm text-muted-foreground">
            Manage your income sources
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Add Income
        </Button>
      </div>

      {/* Summary Cards */}
      {hasTransactions && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Total Income
                <TrendingUp className="size-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(totalIncome)}
              </p>
              <span className="text-xs text-muted-foreground">
                {filteredTransactions.length} deposit{filteredTransactions.length !== 1 ? "s" : ""}
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Avg Deposit
                <Hash className="size-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(avgTransaction)}
              </p>
              <span className="text-xs text-muted-foreground">Per credit</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Categories
                <Layers className="size-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {categoryBreakdown.length}
              </p>
              <span className="text-xs text-muted-foreground">Active categories</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Top Source
                <Crown className="size-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="truncate text-2xl font-bold">{topCategory}</p>
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
                placeholder="Search sources..."
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
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      innerRadius={35}
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
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        backgroundColor: "hsl(var(--card))",
                        color: "hsl(var(--foreground))",
                        fontSize: "13px",
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => (
                        <span className="text-xs text-muted-foreground">
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle>Top Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topSources}
                    layout="vertical"
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => formatCurrency(v)}
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      type="category"
                      dataKey="source"
                      width={80}
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      tickFormatter={(v: string) =>
                        v.length > 18 ? v.slice(0, 18) + "..." : v
                      }
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), "Amount"]}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        backgroundColor: "hsl(var(--card))",
                        color: "hsl(var(--foreground))",
                        fontSize: "13px",
                      }}
                    />
                    <Bar
                      dataKey="amount"
                      fill="#22c55e"
                      radius={[0, 4, 4, 0]}
                      barSize={20}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Manual Income Entries */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Recurring Income</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Failed to load income"}
              </p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <IncomeList
              entries={entries ?? []}
              householdMembers={household?.members}
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

      <IncomeForm
        open={formOpen}
        onOpenChange={handleFormClose}
        income={editingEntry}
        householdMembers={household?.members}
      />
    </div>
  );
}
