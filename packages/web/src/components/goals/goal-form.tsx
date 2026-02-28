import { useState, type FormEvent } from "react";
import type { Goal, GoalType, Category } from "@spendoza/shared";
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
import { useCreateGoal, useUpdateGoal } from "@/hooks/use-goals";
import { useDebts } from "@/hooks/use-debts";

export function GoalForm({
  open,
  onOpenChange,
  goal,
  categories,
  entityType,
  entityId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal | null;
  categories: Category[];
  entityType?: "user" | "household";
  entityId?: string;
}) {
  const isEditing = !!goal;
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();

  const [name, setName] = useState(goal?.name ?? "");
  const [goalType, setGoalType] = useState<GoalType>(goal?.goal_type ?? "budget");
  const [categoryId, setCategoryId] = useState(goal?.category_id ?? "");
  const [targetAmount, setTargetAmount] = useState(goal?.target_amount?.toString() ?? "");
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "");
  const [debtId, setDebtId] = useState<string>(goal?.debt_id ?? "");
  const [error, setError] = useState<string | null>(null);

  const { data: debts } = useDebts(entityType);

  const isPending = createGoal.isPending || updateGoal.isPending;

  function resetForm() {
    setName("");
    setGoalType("budget");
    setCategoryId("");
    setTargetAmount("");
    setTargetDate("");
    setDebtId("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const data: any = {
      name: name.trim(),
      goal_type: goalType,
      category_id: goalType === "budget" ? categoryId || null : null,
      target_amount: parseFloat(targetAmount),
      target_date: goalType === "target_savings" ? targetDate || null : null,
      debt_id: goalType === "debt_payoff" ? debtId || null : null,
      ...(!isEditing && entityType && entityId ? { entity_type: entityType, entity_id: entityId } : {}),
    };

    try {
      if (isEditing && goal) {
        await updateGoal.mutateAsync({ id: goal.id, data });
      } else {
        await createGoal.mutateAsync(data);
      }
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goal");
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
          <DialogTitle>{isEditing ? "Edit Goal" : "Add Goal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="goal_name">Name</Label>
            <Input
              id="goal_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grocery Budget, Emergency Fund"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select
                value={goalType}
                onValueChange={(v) => setGoalType(v as GoalType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="budget">Category Budget</SelectItem>
                  <SelectItem value="savings_amount">Monthly Savings ($)</SelectItem>
                  <SelectItem value="savings_rate">Savings Rate (%)</SelectItem>
                  <SelectItem value="emergency_fund">Emergency Fund</SelectItem>
                  <SelectItem value="debt_payoff">Debt Payoff</SelectItem>
                  <SelectItem value="target_savings">Savings Target</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="goal_target">
                {goalType === "savings_rate" ? "Target %" : "Target Amount"}
              </Label>
              <Input
                id="goal_target"
                type="number"
                step="0.01"
                min="0.01"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="0.00"
                required
              />
              {goalType === "savings_rate" && (
                <p className="text-xs text-muted-foreground">
                  Enter as percentage (e.g., 20 for 20%)
                </p>
              )}
              {goalType === "emergency_fund" && (
                <p className="text-xs text-muted-foreground">
                  Recommended: 3-6 months of expenses
                </p>
              )}
            </div>
          </div>

          {goalType === "budget" && (
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
          )}

          {goalType === "debt_payoff" && debts && debts.length > 0 && (
            <div className="space-y-2">
              <Label>Linked Debt</Label>
              <Select value={debtId} onValueChange={setDebtId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a debt" />
                </SelectTrigger>
                <SelectContent>
                  {debts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} (${d.current_balance.toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {goalType === "target_savings" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal_target_date">Target Date (optional)</Label>
              <Input
                id="goal_target_date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEditing ? "Update" : "Add Goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
