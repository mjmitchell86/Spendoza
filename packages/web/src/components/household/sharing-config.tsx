import { useState, type FormEvent } from "react";
import type { IncomeSharingMode, ExpenseSharingMode } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateSharing } from "@/hooks/use-household";

interface SharingConfigProps {
  currentIncomeMode: IncomeSharingMode;
  currentExpenseMode: ExpenseSharingMode;
  currentSharedAmount: number | null;
}

export function SharingConfig({
  currentIncomeMode,
  currentExpenseMode,
  currentSharedAmount,
}: SharingConfigProps) {
  const updateSharing = useUpdateSharing();

  const [incomeMode, setIncomeMode] =
    useState<IncomeSharingMode>(currentIncomeMode);
  const [sharedAmount, setSharedAmount] = useState(
    currentSharedAmount?.toString() ?? ""
  );
  const [expenseMode, setExpenseMode] =
    useState<ExpenseSharingMode>(currentExpenseMode);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      await updateSharing.mutateAsync({
        income_sharing_mode: incomeMode,
        shared_income_amount:
          incomeMode === "partial" ? parseFloat(sharedAmount) : null,
        expense_sharing_mode: expenseMode,
      });
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update sharing"
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Sharing preferences updated.
        </div>
      )}

      {/* Income Sharing */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Income Sharing</legend>
        <p className="text-xs text-muted-foreground">
          Choose how your income is shared with the household.
        </p>
        <div className="flex flex-col gap-2">
          {(
            [
              { value: "all", label: "Share all income" },
              { value: "none", label: "Keep income private" },
              { value: "partial", label: "Share a specific amount" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 rounded-md border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="income_sharing"
                value={opt.value}
                checked={incomeMode === opt.value}
                onChange={() => setIncomeMode(opt.value)}
                className="size-4"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>

        {incomeMode === "partial" && (
          <div className="flex flex-col gap-2 pl-6">
            <Label htmlFor="shared_amount">Shared Amount</Label>
            <Input
              id="shared_amount"
              type="number"
              step="0.01"
              min="0.01"
              value={sharedAmount}
              onChange={(e) => setSharedAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
        )}
      </fieldset>

      {/* Expense Sharing */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Expense Sharing</legend>
        <p className="text-xs text-muted-foreground">
          Choose how your expenses are shared with the household.
        </p>
        <div className="flex flex-col gap-2">
          {(
            [
              { value: "all", label: "Share all expenses" },
              { value: "none", label: "Keep expenses private" },
              {
                value: "category",
                label: "Share by category (shared categories only)",
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 rounded-md border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="expense_sharing"
                value={opt.value}
                checked={expenseMode === opt.value}
                onChange={() => setExpenseMode(opt.value)}
                className="size-4"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Button
        type="submit"
        className="self-start"
        disabled={updateSharing.isPending}
      >
        {updateSharing.isPending ? "Saving..." : "Save Preferences"}
      </Button>
    </form>
  );
}
