import { useState, useEffect, type FormEvent } from "react";
import type {
  Expense,
  ExpenseFrequency,
  RecurrenceInterval,
  Category,
} from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateExpense, useUpdateExpense } from "@/hooks/use-expenses";

const RECURRENCE_INTERVALS: { value: RecurrenceInterval; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

interface ExpenseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
  categories: Category[];
}

export function ExpenseForm({
  open,
  onOpenChange,
  expense,
  categories,
}: ExpenseFormProps) {
  const isEditing = !!expense;
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();

  const [description, setDescription] = useState(expense?.description ?? "");
  const [friendlyName, setFriendlyName] = useState(expense?.friendly_name ?? "");
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  const [frequency, setFrequency] = useState<ExpenseFrequency>(
    expense?.frequency ?? "one_time"
  );
  const [recurrenceInterval, setRecurrenceInterval] =
    useState<RecurrenceInterval>(expense?.recurrence_interval ?? "monthly");
  const [nextDueDate, setNextDueDate] = useState(
    expense?.next_due_date ?? new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(expense?.end_date ?? "");
  const [error, setError] = useState<string | null>(null);

  // Sync form state when expense prop changes (e.g. clicking Edit on a different expense)
  useEffect(() => {
    if (expense) {
      setDescription(expense.description);
      setFriendlyName(expense.friendly_name ?? "");
      setAmount(expense.amount.toString());
      setCategoryId(expense.category_id);
      setFrequency(expense.frequency);
      setRecurrenceInterval(expense.recurrence_interval ?? "monthly");
      setNextDueDate(expense.next_due_date);
      setEndDate(expense.end_date ?? "");
      setError(null);
    }
  }, [expense]);

  const isPending = createExpense.isPending || updateExpense.isPending;

  function resetForm() {
    setDescription("");
    setFriendlyName("");
    setAmount("");
    setCategoryId("");
    setFrequency("one_time");
    setRecurrenceInterval("monthly");
    setNextDueDate(new Date().toISOString().split("T")[0]);
    setEndDate("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const data = {
      description: description.trim(),
      friendly_name: friendlyName.trim() || null,
      amount: parseFloat(amount),
      category_id: categoryId,
      frequency,
      recurrence_interval:
        frequency === "recurring" ? recurrenceInterval : null,
      next_due_date: nextDueDate,
      end_date: endDate || null,
    };

    try {
      if (isEditing && expense) {
        await updateExpense.mutateAsync({ id: expense.id, data });
      } else {
        await createExpense.mutateAsync(data);
      }
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Expense" : "Add Expense"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Rent, Netflix"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="friendly_name">Friendly Name (optional)</Label>
            <Input
              id="friendly_name"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="e.g. Netflix, Gym Membership"
            />
            <p className="text-xs text-muted-foreground">
              A short display name shown instead of the raw description
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="expense_amount">Amount</Label>
              <Input
                id="expense_amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as ExpenseFrequency)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {frequency === "recurring" && (
              <div className="flex flex-col gap-2">
                <Label>Recurrence Interval</Label>
                <Select
                  value={recurrenceInterval}
                  onValueChange={(v) =>
                    setRecurrenceInterval(v as RecurrenceInterval)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_INTERVALS.map((ri) => (
                      <SelectItem key={ri.value} value={ri.value}>
                        {ri.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="next_due_date">Next Due Date</Label>
              <Input
                id="next_due_date"
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="expense_end_date">End Date (optional)</Label>
              <Input
                id="expense_end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Saving..."
                : isEditing
                  ? "Update"
                  : "Add Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
