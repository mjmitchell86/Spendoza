import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type {
  Goal,
  GoalSuggestion,
  CreateGoalInput,
  UpdateGoalInput,
} from "@spendoza/shared";

export interface GoalProgress {
  goal: Goal;
  current: number;
  target: number;
  history: Array<{ month: string; actual: number }>;
}

export function useGoals(entityType: "user" | "household" = "user") {
  return useQuery<Goal[]>({
    queryKey: ["goals", entityType],
    queryFn: () => apiClient(`/goals?entity_type=${entityType}`),
  });
}

export function useGoalProgress(
  months = 6,
  entityType: "user" | "household" = "user"
) {
  return useQuery<{ goals: GoalProgress[] }>({
    queryKey: ["goals", "progress", entityType, months],
    queryFn: () =>
      apiClient(
        `/goals/progress?months=${months}&entity_type=${entityType}`
      ),
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGoalInput) =>
      apiClient("/goals", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGoalInput }) =>
      apiClient(`/goals/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/goals/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export interface GoalSuggestionsResponse {
  suggestions: GoalSuggestion[];
  report_month: string | null;
}

export function useGoalSuggestions(entityType: "user" | "household" = "user", enabled = true) {
  return useQuery<GoalSuggestionsResponse>({
    queryKey: ["goals", "suggestions", entityType],
    queryFn: () => apiClient(`/goals/suggestions?entity_type=${entityType}`),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
