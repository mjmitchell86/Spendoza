import { useState, type FormEvent } from "react";
import type { Goal } from "@spendoza/shared";
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
import { useUpdateGoal } from "@/hooks/use-goals";
import { formatCurrency } from "./goal-card";

export function LogSavingsDialog({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: Goal | null;
}) {
  const updateGoal = useUpdateGoal();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!goal) return;
    const addAmount = parseFloat(amount);
    if (isNaN(addAmount) || addAmount <= 0) {
      setError("Enter a positive amount");
      return;
    }

    try {
      await updateGoal.mutateAsync({
        id: goal.id,
        data: { current_amount: goal.current_amount + addAmount },
      });
      setAmount("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log savings");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Savings — {goal?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Current: {formatCurrency(goal?.current_amount ?? 0)} of{" "}
            {formatCurrency(goal?.target_amount ?? 0)}
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="log_amount">Amount to add</Label>
            <Input
              id="log_amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateGoal.isPending}>
              {updateGoal.isPending ? "Saving..." : "Log Savings"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
