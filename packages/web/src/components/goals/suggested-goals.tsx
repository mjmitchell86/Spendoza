import { useState } from "react";
import { Sparkles, Plus, Loader2 } from "lucide-react";
import type { Category, GoalSuggestion } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGoalSuggestions, useCreateGoal } from "@/hooks/use-goals";
import { useDebts } from "@/hooks/use-debts";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "./goal-card";

const GOAL_TYPE_LABELS: Record<string, string> = {
  budget: "Budget",
  savings_amount: "Monthly Savings",
  savings_rate: "Savings Rate",
  emergency_fund: "Emergency Fund",
  debt_payoff: "Debt Payoff",
  target_savings: "Savings Target",
};

function formatReportMonth(month: string) {
  const d = new Date(month + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function SuggestedGoals({
  entityType,
  entityId,
  categories,
}: {
  entityType: "user" | "household";
  entityId?: string;
  categories: Category[];
}) {
  const { data, isLoading } = useGoalSuggestions(entityType);
  const createGoal = useCreateGoal();
  const { data: debts } = useDebts(entityType);
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Set<string>>(new Set());

  if (isLoading || !data) return null;

  const suggestions = data.suggestions.filter((s) => !dismissed.has(s.name));
  if (suggestions.length === 0) return null;

  async function handleAdd(suggestion: GoalSuggestion) {
    setAdding((prev) => new Set(prev).add(suggestion.name));

    // Resolve category_id from category name
    let categoryId: string | null = null;
    if (suggestion.goal_type === "budget" && suggestion.category) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === suggestion.category!.toLowerCase()
      );
      categoryId = match?.id ?? null;
    }

    // Resolve debt_id from debt_name for debt_payoff goals
    let debtId: string | null = null;
    if (suggestion.goal_type === "debt_payoff" && suggestion.debt_name && debts) {
      const match = debts.find(
        (d) => d.name.toLowerCase() === suggestion.debt_name!.toLowerCase()
      );
      debtId = match?.id ?? null;
    }

    try {
      await createGoal.mutateAsync({
        name: suggestion.name,
        goal_type: suggestion.goal_type,
        category_id: categoryId,
        debt_id: debtId,
        target_amount: suggestion.target_amount,
        ...(entityType && entityId ? { entity_type: entityType, entity_id: entityId } : {}),
      });
      setDismissed((prev) => new Set(prev).add(suggestion.name));
      void queryClient.invalidateQueries({ queryKey: ["goals", "suggestions"] });
    } finally {
      setAdding((prev) => {
        const next = new Set(prev);
        next.delete(suggestion.name);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-amber-500" />
        <h2 className="text-sm font-semibold">AI Suggested Goals</h2>
        {data.report_month && (
          <span className="text-xs text-muted-foreground">
            Based on {formatReportMonth(data.report_month)} data
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {suggestions.map((s) => {
          const isAdding = adding.has(s.name);
          return (
            <Card key={s.name} className="border-dashed">
              <CardContent className="flex flex-col gap-2 pt-4 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {GOAL_TYPE_LABELS[s.goal_type] ?? s.goal_type}
                      </span>
                    </div>
                    <h3 className="mt-1 text-sm font-semibold">{s.name}</h3>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        Target:{" "}
                        {s.goal_type === "savings_rate"
                          ? `${s.target_amount}%`
                          : formatCurrency(s.target_amount)}
                      </span>
                      {s.goal_type === "budget" && s.category && (
                        <span className="rounded bg-muted px-1.5 py-0.5">{s.category}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={isAdding}
                    onClick={() => void handleAdd(s)}
                  >
                    {isAdding ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                    Add Goal
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{s.rationale}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
