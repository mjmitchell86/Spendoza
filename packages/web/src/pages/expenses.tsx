import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { Expense } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExpenses } from "@/hooks/use-expenses";
import { useCategories } from "@/hooks/use-categories";
import { useAllTransactions, useUpdateTransactionCategory } from "@/hooks/use-transactions";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ExpenseList } from "@/components/expenses/expense-list";
import { TransactionTable } from "@/components/transactions/transaction-table";

export function ExpensesPage() {
  const { data: expenses, isLoading, error, refetch } = useExpenses();
  const { data: categories } = useCategories();
  const { data: debitTransactions } = useAllTransactions({ type: "debit" });
  const updateCategory = useUpdateTransactionCategory();
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

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

      {debitTransactions && debitTransactions.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>Bank Transactions (Debits)</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionTable
              transactions={debitTransactions}
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
