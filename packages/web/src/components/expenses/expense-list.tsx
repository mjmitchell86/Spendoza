import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Expense, Category } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteExpense } from "@/hooks/use-expenses";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const INTERVAL_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

interface ExpenseListProps {
  expenses: Expense[];
  categories: Category[];
  onEdit: (expense: Expense) => void;
}

export function ExpenseList({
  expenses,
  categories,
  onEdit,
}: ExpenseListProps) {
  const deleteExpense = useDeleteExpense();
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [frequencyFilter, setFrequencyFilter] = useState("all");

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const filtered = expenses.filter((exp) => {
    if (categoryFilter !== "all" && exp.category_id !== categoryFilter)
      return false;
    if (frequencyFilter !== "all" && exp.frequency !== frequencyFilter)
      return false;
    return true;
  });

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteExpense.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Error is handled by the mutation
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 pb-4">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={frequencyFilter} onValueChange={setFrequencyFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="one_time">One-time</SelectItem>
            <SelectItem value="recurring">Recurring</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">
            {expenses.length === 0
              ? "No expenses yet."
              : "No expenses match your filters."}
          </p>
          {expenses.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Add your first expense to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="hidden sm:table-cell">
                Frequency
              </TableHead>
              <TableHead className="hidden md:table-cell">Due Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {expense.friendly_name || expense.description}
                    </span>
                    {expense.friendly_name && (
                      <span className="text-xs text-muted-foreground">
                        {expense.description}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {expense.is_ai_adjusted && (
                        <Badge variant="secondary" className="text-xs">
                          AI Adjusted
                        </Badge>
                      )}
                      {expense.auto_detected && (
                        <Badge variant="outline" className="text-xs">
                          Auto-detected
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono">
                  {expense.is_ai_adjusted && expense.original_amount != null ? (
                    <div className="flex flex-col">
                      <span className="text-muted-foreground line-through">
                        {formatCurrency(expense.original_amount)}
                      </span>
                      <span>{formatCurrency(expense.amount)}</span>
                    </div>
                  ) : (
                    formatCurrency(expense.amount)
                  )}
                </TableCell>
                <TableCell>
                  {categoryMap.get(expense.category_id) ?? "Unknown"}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {expense.frequency === "recurring" &&
                  expense.recurrence_interval
                    ? INTERVAL_LABELS[expense.recurrence_interval] ??
                      expense.recurrence_interval
                    : "One-time"}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {formatDate(expense.next_due_date)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(expense)}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(expense)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Expense</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;
              {deleteTarget?.friendly_name || deleteTarget?.description}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteExpense.isPending}
            >
              {deleteExpense.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
