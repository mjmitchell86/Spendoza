import { useState, useEffect, type FormEvent } from "react";
import type { Debt, DebtType } from "@spendoza/shared";
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
import { useCreateDebt, useUpdateDebt } from "@/hooks/use-debts";

const DEBT_TYPE_LABELS: Record<DebtType, string> = {
  credit_card: "Credit Card",
  student_loan: "Student Loan",
  mortgage: "Mortgage",
  auto_loan: "Auto Loan",
  personal_loan: "Personal Loan",
  medical: "Medical",
  other: "Other",
};

interface DebtFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt?: Debt | null;
  entityType?: "user" | "household";
  entityId?: string;
}

export function DebtForm({
  open,
  onOpenChange,
  debt,
  entityType,
  entityId,
}: DebtFormProps) {
  const isEditing = !!debt;
  const createDebt = useCreateDebt();
  const updateDebt = useUpdateDebt();

  const [name, setName] = useState("");
  const [debtType, setDebtType] = useState<DebtType>("credit_card");
  const [originalBalance, setOriginalBalance] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [minimumPayment, setMinimumPayment] = useState("");
  const [dueDateDay, setDueDateDay] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPending = createDebt.isPending || updateDebt.isPending;

  // Sync form state when debt prop changes (for editing)
  useEffect(() => {
    if (debt) {
      setName(debt.name);
      setDebtType(debt.debt_type);
      setOriginalBalance(debt.original_balance.toString());
      setCurrentBalance(debt.current_balance.toString());
      setInterestRate(debt.interest_rate.toString());
      setMinimumPayment(debt.minimum_payment.toString());
      setDueDateDay(debt.due_date_day?.toString() ?? "");
    }
  }, [debt]);

  function resetForm() {
    setName("");
    setDebtType("credit_card");
    setOriginalBalance("");
    setCurrentBalance("");
    setInterestRate("");
    setMinimumPayment("");
    setDueDateDay("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const data: Record<string, unknown> = {
      name: name.trim(),
      debt_type: debtType,
      current_balance: parseFloat(currentBalance),
      interest_rate: parseFloat(interestRate || "0"),
      minimum_payment: parseFloat(minimumPayment || "0"),
      due_date_day: dueDateDay ? parseInt(dueDateDay, 10) : null,
    };

    if (!isEditing) {
      data.original_balance = parseFloat(originalBalance);
    }

    // Add entity fields for new debts (not edits -- entity can't change)
    if (!isEditing && entityType && entityId) {
      data.entity_type = entityType;
      data.entity_id = entityId;
    }

    try {
      if (isEditing && debt) {
        await updateDebt.mutateAsync({ id: debt.id, data });
      } else {
        await createDebt.mutateAsync(data as any);
      }
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save debt");
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
          <DialogTitle>{isEditing ? "Edit Debt" : "Add Debt"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="debt_name">Name</Label>
            <Input
              id="debt_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chase Visa, Student Loan"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <Select
              value={debtType}
              onValueChange={(v) => setDebtType(v as DebtType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DEBT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {!isEditing && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="debt_original_balance">Original Balance</Label>
                <Input
                  id="debt_original_balance"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={originalBalance}
                  onChange={(e) => setOriginalBalance(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="debt_current_balance">Current Balance</Label>
              <Input
                id="debt_current_balance"
                type="number"
                step="0.01"
                min="0"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="debt_interest_rate">Interest Rate (APR %)</Label>
              <Input
                id="debt_interest_rate"
                type="number"
                step="0.01"
                min="0"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="debt_minimum_payment">Minimum Payment</Label>
              <Input
                id="debt_minimum_payment"
                type="number"
                step="0.01"
                min="0"
                value={minimumPayment}
                onChange={(e) => setMinimumPayment(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="debt_due_date_day">Due Date (Day of Month)</Label>
            <Input
              id="debt_due_date_day"
              type="number"
              min="1"
              max="31"
              value={dueDateDay}
              onChange={(e) => setDueDateDay(e.target.value)}
              placeholder="1-31"
            />
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
              {isPending ? "Saving..." : isEditing ? "Update" : "Add Debt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
