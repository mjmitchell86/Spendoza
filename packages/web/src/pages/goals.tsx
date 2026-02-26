import { useState } from "react";
import {
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import type { Goal } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useGoalProgress,
  useDeleteGoal,
} from "@/hooks/use-goals";
import { useCategories } from "@/hooks/use-categories";
import { GoalCard, getGoalStatus } from "@/components/goals/goal-card";
import { GoalForm } from "@/components/goals/goal-form";
import { LogSavingsDialog } from "@/components/goals/log-savings-dialog";
import { SuggestedGoals } from "@/components/goals/suggested-goals";

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

      {/* AI Suggested Goals */}
      <SuggestedGoals entityType="user" categories={categories ?? []} />

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
