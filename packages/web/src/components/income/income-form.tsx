import { useState, useEffect, type FormEvent } from "react";
import type { IncomeEntry, Frequency } from "@spendoza/shared";
import type { HouseholdMember } from "@spendoza/shared";
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
import { useCreateIncome, useUpdateIncome } from "@/hooks/use-income";

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "one_time", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "annually", label: "Annually" },
];

interface IncomeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  income?: IncomeEntry | null;
  householdMembers?: HouseholdMember[];
}

export function IncomeForm({
  open,
  onOpenChange,
  income,
  householdMembers,
}: IncomeFormProps) {
  const isEditing = !!income;
  const createIncome = useCreateIncome();
  const updateIncome = useUpdateIncome();

  const [sourceName, setSourceName] = useState(income?.source_name ?? "");
  const [amount, setAmount] = useState(income?.amount?.toString() ?? "");
  const [frequency, setFrequency] = useState<Frequency>(
    income?.frequency ?? "monthly"
  );
  const [effectiveDate, setEffectiveDate] = useState(
    income?.effective_date ?? new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(income?.end_date ?? "");
  const [attributedToUserId, setAttributedToUserId] = useState(
    income?.attributed_to_user_id ?? ""
  );
  const [attributedToName, setAttributedToName] = useState(
    income?.attributed_to_name ?? ""
  );
  const [attributionMode, setAttributionMode] = useState<
    "none" | "member" | "custom"
  >(
    income?.attributed_to_user_id
      ? "member"
      : income?.attributed_to_name
        ? "custom"
        : "none"
  );
  const [error, setError] = useState<string | null>(null);

  // Sync form state when income prop changes (e.g. clicking Edit on a different entry)
  useEffect(() => {
    if (income) {
      setSourceName(income.source_name);
      setAmount(income.amount.toString());
      setFrequency(income.frequency);
      setEffectiveDate(income.effective_date);
      setEndDate(income.end_date ?? "");
      setAttributedToUserId(income.attributed_to_user_id ?? "");
      setAttributedToName(income.attributed_to_name ?? "");
      setAttributionMode(
        income.attributed_to_user_id
          ? "member"
          : income.attributed_to_name
            ? "custom"
            : "none"
      );
      setError(null);
    }
  }, [income]);

  const isPending = createIncome.isPending || updateIncome.isPending;

  function resetForm() {
    setSourceName("");
    setAmount("");
    setFrequency("monthly");
    setEffectiveDate(new Date().toISOString().split("T")[0]);
    setEndDate("");
    setAttributedToUserId("");
    setAttributedToName("");
    setAttributionMode("none");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const data = {
      source_name: sourceName.trim(),
      amount: parseFloat(amount),
      frequency,
      effective_date: effectiveDate,
      end_date: endDate || null,
      attributed_to_user_id:
        attributionMode === "member" && attributedToUserId && attributedToUserId !== "none"
          ? attributedToUserId
          : null,
      attributed_to_name:
        attributionMode === "custom" && attributedToName.trim()
          ? attributedToName.trim()
          : null,
    };

    try {
      if (isEditing && income) {
        await updateIncome.mutateAsync({ id: income.id, data });
      } else {
        await createIncome.mutateAsync(data);
      }
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save income");
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
            {isEditing ? "Edit Income" : "Add Income"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="source_name">Source Name</Label>
            <Input
              id="source_name"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="e.g. Salary, Freelance"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
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
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as Frequency)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="effective_date">Effective Date</Label>
              <Input
                id="effective_date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="end_date">End Date (optional)</Label>
              <Input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Attributed To (optional)</Label>
            <Select
              value={attributionMode}
              onValueChange={(v) => setAttributionMode(v as "none" | "member" | "custom")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Who earned this?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Me (default)</SelectItem>
                {householdMembers && householdMembers.length > 0 && (
                  <SelectItem value="member">Household Member</SelectItem>
                )}
                <SelectItem value="custom">Custom Name</SelectItem>
              </SelectContent>
            </Select>

            {attributionMode === "member" && householdMembers && householdMembers.length > 0 && (
              <Select
                value={attributedToUserId}
                onValueChange={setAttributedToUserId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {householdMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {attributionMode === "custom" && (
              <Input
                value={attributedToName}
                onChange={(e) => setAttributedToName(e.target.value)}
                placeholder="e.g. Jane, Partner"
                maxLength={100}
              />
            )}
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
                  : "Add Income"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
