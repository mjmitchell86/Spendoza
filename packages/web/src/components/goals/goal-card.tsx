import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Trash2,
  PiggyBank,
  CalendarClock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { Goal, GoalType, Category } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { GoalProgress } from "@/hooks/use-goals";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMonth(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function getGoalStatus(gp: GoalProgress): "on_track" | "warning" | "exceeded" {
  if (gp.goal.goal_type === "budget") {
    const pct = gp.target > 0 ? gp.current / gp.target : 0;
    if (pct > 1) return "exceeded";
    if (pct > 0.8) return "warning";
    return "on_track";
  }
  // For savings-type goals (savings_amount, savings_rate, debt_payoff),
  // "on track" means meeting or exceeding the target
  if (
    gp.goal.goal_type === "savings_amount" ||
    gp.goal.goal_type === "savings_rate" ||
    gp.goal.goal_type === "debt_payoff"
  ) {
    const pct = gp.target > 0 ? gp.current / gp.target : 0;
    if (pct >= 1) return "on_track";
    if (pct >= 0.5) return "warning";
    return "exceeded"; // behind
  }
  // target_savings, emergency_fund — cumulative goals
  const pct = gp.target > 0 ? gp.current / gp.target : 0;
  if (pct >= 1) return "on_track";
  if (pct >= 0.5) return "warning";
  return "exceeded";
}

export const STATUS_STYLES = {
  on_track: { color: "text-green-600", bg: "bg-green-500", label: "On Track" },
  warning: { color: "text-yellow-600", bg: "bg-yellow-500", label: "Warning" },
  exceeded: { color: "text-red-600", bg: "bg-red-500", label: "Over Budget" },
} as const;

export function GoalHistoryChart({
  history,
  target,
  goalType,
}: {
  history: Array<{ month: string; actual: number }>;
  target: number;
  goalType: GoalType;
}) {
  if (history.length === 0) return null;

  const chartData = history.map((h) => ({
    month: formatMonth(h.month),
    actual: Math.round(h.actual),
  }));

  // Budget goals use red; all savings-type goals use green
  const barColor = goalType === "budget" ? "#ef4444" : "#22c55e";

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
          <YAxis
            tickFormatter={(v: number) =>
              goalType === "savings_rate" ? `${Math.round(v)}%` : formatCurrency(v)
            }
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
          />
          <Tooltip
            formatter={(value: number) => [
              goalType === "savings_rate" ? `${Math.round(value)}%` : formatCurrency(value),
              "Actual",
            ]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
              fontSize: "13px",
            }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <ReferenceLine
            y={target}
            stroke="#6b7280"
            strokeDasharray="4 4"
            label={{ value: "Target", position: "right", fontSize: 11 }}
          />
          <Bar dataKey="actual" fill={barColor} radius={[4, 4, 0, 0]} barSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GoalCard({
  gp,
  categories,
  onEdit,
  onDelete,
  onLogSavings,
}: {
  gp: GoalProgress;
  categories: Category[];
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  onLogSavings: (goal: Goal) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const { goal, current, target, history } = gp;
  const status = getGoalStatus(gp);
  const style = STATUS_STYLES[status];

  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const categoryName = goal.category_id
    ? categories.find((c) => c.id === goal.category_id)?.name
    : null;

  const daysRemaining =
    goal.target_date
      ? Math.max(
          0,
          Math.ceil(
            (new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        )
      : null;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold">{goal.name}</h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.color} bg-opacity-10`}
              >
                {status === "on_track" && <CheckCircle2 className="size-3" />}
                {status === "warning" && <AlertTriangle className="size-3" />}
                {status === "exceeded" && <AlertTriangle className="size-3" />}
                {style.label}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {goal.goal_type === "budget" && categoryName && (
                <span className="rounded bg-muted px-1.5 py-0.5">{categoryName}</span>
              )}
              {goal.goal_type === "budget" && (
                <span>Monthly budget</span>
              )}
              {goal.goal_type === "savings_amount" && (
                <span>Monthly savings target</span>
              )}
              {goal.goal_type === "savings_rate" && (
                <span>Savings rate target</span>
              )}
              {goal.goal_type === "emergency_fund" && (
                <span>Emergency fund</span>
              )}
              {goal.goal_type === "debt_payoff" && (
                <span>Debt payoff</span>
              )}
              {goal.goal_type === "target_savings" && (
                <>
                  <span>Savings goal</span>
                  {goal.target_date && (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="size-3" />
                      {daysRemaining} days left
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {(goal.goal_type === "target_savings" || goal.goal_type === "emergency_fund") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onLogSavings(goal)}
                title="Log savings"
              >
                <PiggyBank className="size-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onEdit(goal)}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(goal.id)}
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
              {goal.goal_type === "budget"
                ? `Spent ${formatCurrency(current)} of ${formatCurrency(target)}`
                : goal.goal_type === "savings_amount"
                  ? `Saved ${formatCurrency(Math.max(0, current))} of ${formatCurrency(target)} this month`
                  : goal.goal_type === "savings_rate"
                    ? `${Math.round(current)}% of ${Math.round(target)}%`
                    : goal.goal_type === "debt_payoff"
                      ? `Paid ${formatCurrency(current)} of ${formatCurrency(target)}`
                      : `Saved ${formatCurrency(current)} of ${formatCurrency(target)}`}
            </span>
            <span className="text-muted-foreground">{Math.round(pct)}%</span>
          </div>
          <Progress
            value={pct}
            className={`h-2.5 ${
              status === "exceeded"
                ? "[&>[data-slot=progress-indicator]]:bg-red-500"
                : status === "warning"
                  ? "[&>[data-slot=progress-indicator]]:bg-yellow-500"
                  : "[&>[data-slot=progress-indicator]]:bg-green-500"
            }`}
          />
        </div>

        {/* History toggle */}
        {history.length > 0 && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-xs text-muted-foreground"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? (
                <>
                  <ChevronUp className="mr-1 size-3" /> Hide history
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 size-3" /> Show history
                </>
              )}
            </Button>
            {showHistory && (
              <div className="mt-2">
                <GoalHistoryChart
                  history={history}
                  target={target}
                  goalType={goal.goal_type}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
