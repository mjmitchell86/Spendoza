import { useState, useMemo } from "react";
import { Plus, RefreshCw } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { Expense } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ExpenseList } from "@/components/expenses/expense-list";
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

export function ExpensesPage() {
  const { data: expenses, isLoading, error, refetch } = useExpenses();
  const { data: categories } = useCategories();
  const { data: debitTransactions } = useAllTransactions({ type: "debit" });
  const updateCategory = useUpdateTransactionCategory();
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("__all__");

  const categoryBreakdown = useMemo(() => {
    if (!debitTransactions || debitTransactions.length === 0) return [];

    const totals = new Map<string, number>();
    let grandTotal = 0;

    for (const txn of debitTransactions) {
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
  }, [debitTransactions]);

  const uniqueCategories = useMemo(() => {
    if (!debitTransactions) return [];
    const cats = new Set<string>();
    for (const txn of debitTransactions) {
      if (txn.ai_category) cats.add(txn.ai_category);
    }
    return Array.from(cats).sort();
  }, [debitTransactions]);

  const filteredDebitTransactions = useMemo(() => {
    if (!debitTransactions) return [];
    if (selectedCategory === "__all__") return debitTransactions;
    if (selectedCategory === "__uncategorized__") {
      return debitTransactions.filter((t) => !t.ai_category);
    }
    return debitTransactions.filter((t) => t.ai_category === selectedCategory);
  }, [debitTransactions, selectedCategory]);

  function handleEdit(expense: Expense) {
    setEditingExpense(expense);
    setFormOpen(true);
  }

  function handleFormClose(open: boolean) {
    setFormOpen(open);
    if (!open) setEditingExpense(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Track and manage your expenses
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Add Expense
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Expense Entries</CardTitle>
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

      {categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>Expense Breakdown by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={2}
                    label={({ category, percentage }) =>
                      `${category} ${percentage.toFixed(0)}%`
                    }
                    labelLine={{ strokeWidth: 1 }}
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
      )}

      {debitTransactions && debitTransactions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-0">
            <CardTitle>Bank Transactions (Debits)</CardTitle>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-8 w-[200px]">
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
          </CardHeader>
          <CardContent>
            <TransactionTable
              transactions={filteredDebitTransactions}
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
