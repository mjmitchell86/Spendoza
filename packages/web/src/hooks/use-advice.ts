import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type {
  AdviceResponse,
  AdviceUsage,
  AskAdviceInput,
} from "@spendoza/shared";

export function useAdviceUsage() {
  return useQuery<AdviceUsage>({
    queryKey: ["advice", "usage"],
    queryFn: () => apiClient("/advice/usage"),
  });
}

export function useAdviceHistory() {
  return useQuery<AdviceResponse[]>({
    queryKey: ["advice", "history"],
    queryFn: () => apiClient("/advice/history"),
  });
}

export function useAskAdvice() {
  const queryClient = useQueryClient();
  return useMutation<AdviceResponse, Error, AskAdviceInput>({
    mutationFn: (data) =>
      apiClient("/advice", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["advice"] });
    },
  });
}
