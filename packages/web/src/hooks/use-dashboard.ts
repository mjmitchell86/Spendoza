import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export interface DashboardSummary {
  total_income: number;
  total_expenses: number;
  savings_rate: number;
  net: number;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

export interface DashboardTrends {
  income_change: number;
  expense_change: number;
}

export interface MemberContribution {
  user_id: string;
  display_name: string;
  income: number;
  expenses: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  by_category: CategoryBreakdown[];
  trends: DashboardTrends;
  insights: string;
}

export interface HouseholdDashboardData extends DashboardData {
  member_contributions: MemberContribution[];
}

export function usePersonalDashboard(month?: string) {
  const qs = month ? `?month=${month}` : "";
  return useQuery<DashboardData>({
    queryKey: ["dashboard", "personal", month],
    queryFn: () => apiClient(`/dashboard/personal${qs}`),
  });
}

export function useHouseholdDashboard(month?: string) {
  const qs = month ? `?month=${month}` : "";
  return useQuery<HouseholdDashboardData>({
    queryKey: ["dashboard", "household", month],
    queryFn: () => apiClient(`/dashboard/household${qs}`),
  });
}

export function useGenerateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient("/reports/generate", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
