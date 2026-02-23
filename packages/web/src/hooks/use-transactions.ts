import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Transaction, TransactionType } from "@spendoza/shared";

interface TransactionFilters {
  type?: TransactionType;
  from_date?: string;
  to_date?: string;
}

export function useAllTransactions(filters?: TransactionFilters) {
  const params = new URLSearchParams();
  if (filters?.type) params.set("type", filters.type);
  if (filters?.from_date) params.set("from_date", filters.from_date);
  if (filters?.to_date) params.set("to_date", filters.to_date);
  const qs = params.toString();

  return useQuery<Transaction[]>({
    queryKey: ["transactions", filters],
    queryFn: () => apiClient(`/transactions${qs ? `?${qs}` : ""}`),
  });
}

export function useUpdateTransactionCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionId,
      ai_category,
    }: {
      transactionId: string;
      ai_category: string | null;
    }) =>
      apiClient(`/transactions/${transactionId}`, {
        method: "PUT",
        body: JSON.stringify({ ai_category }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
