import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  insights: string | null;
  insights_month?: string;
  /** Whether the displayed month has bank statement transactions */
  has_transactions?: boolean;
  /** The most recent month that has transactions (only set when has_transactions is false) */
  latest_transaction_month?: string | null;
  /** The month being displayed */
  month?: string;
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

export function useHouseholdDashboard(month?: string, enabled = true) {
  const qs = month ? `?month=${month}` : "";
  return useQuery<HouseholdDashboardData>({
    queryKey: ["dashboard", "household", month],
    queryFn: () => apiClient(`/dashboard/household${qs}`),
    enabled,
  });
}

export function useGenerateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient("/reports/generate", { method: "POST" }),
    onSuccess: () => {
      toast.success("Report generated");
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate report"
      );
    },
  });
}
