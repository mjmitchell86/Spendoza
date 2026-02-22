import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type {
  BankStatement,
  Transaction,
  BulkAttributeTransactionsInput,
} from "@spendoza/shared";

export function useBankStatements() {
  return useQuery<BankStatement[]>({
    queryKey: ["bank-statements"],
    queryFn: () => apiClient("/bank-statements"),
  });
}

export function useBankStatement(id: string | null) {
  return useQuery<BankStatement>({
    queryKey: ["bank-statements", id],
    queryFn: () => apiClient(`/bank-statements/${id}`),
    enabled: !!id,
  });
}

export function useTransactions(statementId: string | null) {
  return useQuery<Transaction[]>({
    queryKey: ["transactions", statementId],
    queryFn: () => apiClient(`/bank-statements/${statementId}/transactions`),
    enabled: !!statementId,
  });
}

export function useUploadBankStatement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/bank-statements/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bank-statements"] });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionId,
      data,
    }: {
      transactionId: string;
      data: { ai_category?: string | null; attributed_to_user_id?: string };
    }) =>
      apiClient(`/transactions/${transactionId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useBulkAttributeTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkAttributeTransactionsInput) =>
      apiClient("/transactions/bulk-attribute", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
