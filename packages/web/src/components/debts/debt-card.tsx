import { Pencil, Trash2 } from "lucide-react";
import type { Debt, DebtType } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/components/goals/goal-card";

const DEBT_TYPE_LABELS: Record<DebtType, string> = {
  credit_card: "Credit Card",
  student_loan: "Student Loan",
  mortgage: "Mortgage",
  auto_loan: "Auto Loan",
  personal_loan: "Personal Loan",
  medical: "Medical",
  other: "Other",
};

export function DebtCard({
  debt,
  onEdit,
  onDelete,
}: {
  debt: Debt;
  onEdit: (debt: Debt) => void;
  onDelete: (id: string) => void;
}) {
  const paidOff =
    debt.original_balance > 0
      ? ((debt.original_balance - debt.current_balance) /
          debt.original_balance) *
        100
      : 0;
  const paidPct = Math.min(Math.max(paidOff, 0), 100);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold">{debt.name}</h3>
              <Badge variant="secondary">{DEBT_TYPE_LABELS[debt.debt_type]}</Badge>
            </div>
            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(debt.current_balance)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{debt.interest_rate}% APR</span>
              <span>Min: {formatCurrency(debt.minimum_payment)}/mo</span>
              {debt.due_date_day && <span>Due: {ordinal(debt.due_date_day)}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(debt)}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(debt.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span>
              {formatCurrency(debt.original_balance - debt.current_balance)} paid
              of {formatCurrency(debt.original_balance)}
            </span>
            <span className="text-muted-foreground">{Math.round(paidPct)}%</span>
          </div>
          <Progress
            value={paidPct}
            className="h-2.5 [&>[data-slot=progress-indicator]]:bg-green-500"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ordinal(day: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = day % 100;
  return day + (s[(v - 20) % 10] || s[v] || s[0]);
}
