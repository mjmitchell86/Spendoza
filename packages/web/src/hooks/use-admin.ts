import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type {
  AdminStatsResponse,
  AdminTrendsResponse,
  AdminUsersResponse,
  AdminUpdateUserInput,
} from "@spendoza/shared";

export function useAdminStats() {
  return useQuery<AdminStatsResponse>({
    queryKey: ["admin", "stats"],
    queryFn: () => apiClient("/admin/stats"),
  });
}

export function useAdminTrends(months = 12) {
  return useQuery<AdminTrendsResponse>({
    queryKey: ["admin", "trends", months],
    queryFn: () => apiClient(`/admin/stats/trends?months=${months}`),
  });
}

export function useAdminUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  tier?: string;
  is_admin?: boolean;
  disabled?: boolean;
} = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.search) searchParams.set("search", params.search);
  if (params.tier) searchParams.set("tier", params.tier);
  if (params.is_admin !== undefined) searchParams.set("is_admin", String(params.is_admin));
  if (params.disabled !== undefined) searchParams.set("disabled", String(params.disabled));

  const qs = searchParams.toString();
  return useQuery<AdminUsersResponse>({
    queryKey: ["admin", "users", params],
    queryFn: () => apiClient(`/admin/users${qs ? `?${qs}` : ""}`),
  });
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdminUpdateUserInput }) =>
      apiClient(`/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export function useDeleteAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export function useAdminGenerateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/admin/users/${id}/generate-report`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export function useAdminDetectRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/admin/users/${id}/detect-recurring`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}
