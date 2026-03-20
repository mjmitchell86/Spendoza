import { useState } from "react";
import { Pencil, Trash2, ChevronDown, ChevronUp, CreditCard } from "lucide-react";
import type { Debt, DebtType } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/components/goals/goal-card";
import { useDebtPayments } from "@/hooks/use-debts";

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
  const [showPayments, setShowPayments] = useState(false);
  const { data: payments } = useDebtPayments(
    debt.id,
    showPayments && debt.debt_type === "credit_card"
  );

  const paidOff =
    debt.original_balance > 0
      ? ((debt.original_balance - debt.current_balance) /
          debt.original_balance) *
        100
      : 0;
  const paidPct = Math.min(Math.max(paidOff, 0), 100);

  const isCreditCard = debt.debt_type === "credit_card";

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

        {/* Payment History for Credit Cards */}
        {isCreditCard && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowPayments(!showPayments)}
              className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <CreditCard className="size-3.5" />
              Linked Payments
              {showPayments ? (
                <ChevronUp className="ml-auto size-3.5" />
              ) : (
                <ChevronDown className="ml-auto size-3.5" />
              )}
            </button>

            {showPayments && (
              <div className="mt-2">
                <Separator className="mb-2" />
                {!payments || payments.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">
                    No payments linked yet. Payments from bank statements will be
                    automatically linked.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{p.description}</p>
                          <p className="text-muted-foreground">
                            {new Date(p.date + "T00:00:00").toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric", year: "numeric" }
                            )}
                          </p>
                        </div>
                        <span className="ml-2 shrink-0 font-mono text-green-600">
                          -{formatCurrency(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ordinal(day: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = day % 100;
  return day + (s[(v - 20) % 10] || s[v] || s[0]);
}
