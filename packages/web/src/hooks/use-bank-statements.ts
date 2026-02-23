import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, API_BASE } from "@/lib/api";
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
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasProcessing = data.some(
        (s) => s.status === "uploaded" || s.status === "processing"
      );
      return hasProcessing ? 3000 : false;
    },
  });
}

export function useBankStatement(id: string | null) {
  const query = useQuery<BankStatement>({
    queryKey: ["bank-statements", id],
    queryFn: async () => {
      const res = await apiClient(`/bank-statements/${id}`);
      return res.statement;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "uploaded" || status === "processing" ? 3000 : false;
    },
  });
  return query;
}

export function useTransactions(statementId: string | null) {
  return useQuery<Transaction[]>({
    queryKey: ["transactions", statementId],
    queryFn: async () => {
      const res = await apiClient(`/bank-statements/${statementId}`);
      return res.transactions;
    },
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
      const response = await fetch(`${API_BASE}/api/bank-statements/upload`, {
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
