import { useState, type FormEvent } from "react";
import {
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import {
  useGoalProgress,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  type GoalProgress,
} from "@/hooks/use-goals";
import { useCategories } from "@/hooks/use-categories";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonth(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function getGoalStatus(gp: GoalProgress): "on_track" | "warning" | "exceeded" {
  if (gp.goal.goal_type === "budget") {
    const pct = gp.target > 0 ? gp.current / gp.target : 0;
    if (pct > 1) return "exceeded";
    if (pct > 0.8) return "warning";
    return "on_track";
  }
  // For savings goals, "on track" means meeting or exceeding the target
  if (gp.goal.goal_type === "monthly_savings") {
    const pct = gp.target > 0 ? gp.current / gp.target : 0;
    if (pct >= 1) return "on_track";
    if (pct >= 0.5) return "warning";
    return "exceeded"; // behind
  }
  // total_savings
  const pct = gp.target > 0 ? gp.current / gp.target : 0;
  if (pct >= 1) return "on_track";
  if (pct >= 0.5) return "warning";
  return "exceeded";
}

const STATUS_STYLES = {
  on_track: { color: "text-green-600", bg: "bg-green-500", label: "On Track" },
  warning: { color: "text-yellow-600", bg: "bg-yellow-500", label: "Warning" },
  exceeded: { color: "text-red-600", bg: "bg-red-500", label: "Over Budget" },
} as const;

// ---------------------------------------------------------------------------
// GoalHistoryChart
// ---------------------------------------------------------------------------

function GoalHistoryChart({
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

  const barColor = goalType === "budget" ? "#ef4444" : "#22c55e";

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
          <YAxis
            tickFormatter={(v: number) => formatCurrency(v)}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
          />
          <Tooltip
            formatter={(value: number) => [formatCurrency(value), "Actual"]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--card))",
              fontSize: "13px",
            }}
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

// ---------------------------------------------------------------------------
// GoalCard
// ---------------------------------------------------------------------------

function GoalCard({
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
              {goal.goal_type === "monthly_savings" && (
                <span>Monthly savings target</span>
              )}
              {goal.goal_type === "total_savings" && (
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
            {goal.goal_type === "total_savings" && (
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
                : goal.goal_type === "monthly_savings"
                  ? `Saved ${formatCurrency(Math.max(0, current))} of ${formatCurrency(target)} this month`
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

// ---------------------------------------------------------------------------
// GoalForm
// ---------------------------------------------------------------------------

function GoalForm({
  open,
  onOpenChange,
  goal,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal | null;
  categories: Category[];
}) {
  const isEditing = !!goal;
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();

  const [name, setName] = useState(goal?.name ?? "");
  const [goalType, setGoalType] = useState<GoalType>(goal?.goal_type ?? "budget");
  const [categoryId, setCategoryId] = useState(goal?.category_id ?? "");
  const [targetAmount, setTargetAmount] = useState(goal?.target_amount?.toString() ?? "");
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "");
  const [error, setError] = useState<string | null>(null);

  const isPending = createGoal.isPending || updateGoal.isPending;

  function resetForm() {
    setName("");
    setGoalType("budget");
    setCategoryId("");
    setTargetAmount("");
    setTargetDate("");
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
      target_date: goalType === "total_savings" && targetDate ? targetDate : null,
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
                  <SelectItem value="budget">Budget (spending cap)</SelectItem>
                  <SelectItem value="monthly_savings">Monthly Savings</SelectItem>
                  <SelectItem value="total_savings">Total Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="goal_target">Target Amount</Label>
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

          {goalType === "total_savings" && (
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

// ---------------------------------------------------------------------------
// LogSavingsDialog
// ---------------------------------------------------------------------------

function LogSavingsDialog({
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

// ---------------------------------------------------------------------------
// GoalsPage
// ---------------------------------------------------------------------------

export function GoalsPage() {
  const { data: progressData, isLoading, error, refetch } = useGoalProgress(6);
  const { data: categories } = useCategories();

  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [logSavingsGoal, setLogSavingsGoal] = useState<Goal | null>(null);
  const deleteGoal = useDeleteGoal();

  const goals = progressData?.goals ?? [];

  // Summary counts
  const totalGoals = goals.length;
  const onTrackCount = goals.filter((gp) => getGoalStatus(gp) === "on_track").length;
  const needsAttentionCount = goals.filter(
    (gp) => getGoalStatus(gp) === "warning" || getGoalStatus(gp) === "exceeded"
  ).length;

  function handleEdit(goal: Goal) {
    setEditingGoal(goal);
    setFormOpen(true);
  }

  function handleFormClose(open: boolean) {
    setFormOpen(open);
    if (!open) setEditingGoal(null);
  }

  function handleDelete(id: string) {
    if (confirm("Delete this goal?")) {
      deleteGoal.mutate(id);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground">
            Set budgets and savings targets
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Add Goal
        </Button>
      </div>

      {/* Summary Cards */}
      {totalGoals > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Total Goals
                <Target className="size-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalGoals}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                On Track
                <TrendingUp className="size-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{onTrackCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Needs Attention
                <AlertTriangle className="size-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-yellow-600">{needsAttentionCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Goals List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load goals"}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
            <Target className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No goals yet. Create a budget or savings goal to start tracking.
            </p>
            <Button variant="outline" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              Add Your First Goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {goals.map((gp) => (
            <GoalCard
              key={gp.goal.id}
              gp={gp}
              categories={categories ?? []}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onLogSavings={(g) => setLogSavingsGoal(g)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <GoalForm
        open={formOpen}
        onOpenChange={handleFormClose}
        goal={editingGoal}
        categories={categories ?? []}
      />

      <LogSavingsDialog
        open={!!logSavingsGoal}
        onOpenChange={(open) => {
          if (!open) setLogSavingsGoal(null);
        }}
        goal={logSavingsGoal}
      />
    </div>
  );
}
