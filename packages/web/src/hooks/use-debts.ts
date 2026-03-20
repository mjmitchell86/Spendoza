import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type {
  Debt,
  CreateDebtInput,
  UpdateDebtInput,
  DebtProjection,
  DebtPayoffStrategy,
  DebtPayment,
  LinkTransactionToDebtInput,
} from "@spendoza/shared";

export interface DebtProjectionsResponse {
  individual: DebtProjection[];
  avalanche: DebtPayoffStrategy;
  snowball: DebtPayoffStrategy;
}

export function useDebts(entityType: "user" | "household" = "user") {
  return useQuery<Debt[]>({
    queryKey: ["debts", entityType],
    queryFn: () => apiClient(`/debts?entity_type=${entityType}`),
  });
}

export function useDebtProjections(
  entityType: "user" | "household" = "user",
  extraPayment = 0
) {
  return useQuery<DebtProjectionsResponse>({
    queryKey: ["debts", "projections", entityType, extraPayment],
    queryFn: () =>
      apiClient(
        `/debts/projections?entity_type=${entityType}&extra_payment=${extraPayment}`
      ),
  });
}

export function useCreateDebt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDebtInput) =>
      apiClient("/debts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["debts"] });
    },
  });
}

export function useUpdateDebt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDebtInput }) =>
      apiClient(`/debts/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["debts"] });
    },
  });
}

export function useDeleteDebt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/debts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["debts"] });
    },
  });
}

export function useDebtPayments(debtId: string, enabled = true) {
  return useQuery<DebtPayment[]>({
    queryKey: ["debts", "payments", debtId],
    queryFn: () => apiClient(`/debts/${debtId}/payments`),
    enabled,
  });
}

export function useLinkTransactionToDebt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LinkTransactionToDebtInput) =>
      apiClient("/debts/link-transaction", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["debts"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
