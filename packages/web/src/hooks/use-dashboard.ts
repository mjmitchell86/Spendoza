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

export interface HealthScoreFactor {
  rating: string;
}

export interface FinancialHealthScore {
  score: number;
  previous_score: number | null;
  factors: {
    savings_rate: HealthScoreFactor;
    needs_ratio: HealthScoreFactor;
    wants_ratio: HealthScoreFactor;
    emergency_fund: HealthScoreFactor;
    debt_to_income: HealthScoreFactor;
  };
}

export interface AllocationCategory {
  amount: number;
  percentage: number;
}

export interface Allocation {
  needs: AllocationCategory;
  wants: AllocationCategory;
  savings: AllocationCategory;
  unclassified: AllocationCategory;
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
  /** Financial health score with factor ratings */
  financial_health_score?: FinancialHealthScore;
  /** Spending allocation breakdown (needs/wants/savings) */
  allocation?: Allocation;
}

export interface HouseholdDashboardData extends DashboardData {
  member_contributions: MemberContribution[];
}

interface DashboardParams {
  month?: string;
  from_date?: string;
  to_date?: string;
}

export function usePersonalDashboard(params?: DashboardParams) {
  const qs = new URLSearchParams();
  if (params?.month) qs.set("month", params.month);
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  const qsStr = qs.toString();

  return useQuery<DashboardData>({
    queryKey: ["dashboard", "personal", params],
    queryFn: () => apiClient(`/dashboard/personal${qsStr ? `?${qsStr}` : ""}`),
  });
}

export function useHouseholdDashboard(params?: DashboardParams, enabled = true) {
  const qs = new URLSearchParams();
  if (params?.month) qs.set("month", params.month);
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  const qsStr = qs.toString();

  return useQuery<HouseholdDashboardData>({
    queryKey: ["dashboard", "household", params],
    queryFn: () => apiClient(`/dashboard/household${qsStr ? `?${qsStr}` : ""}`),
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
