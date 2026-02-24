import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { InviteCode } from "@spendoza/shared";

export function useInviteCodes() {
  return useQuery<InviteCode[]>({
    queryKey: ["invite-codes"],
    queryFn: () => apiClient("/invite-codes"),
  });
}

export function useCreateInviteCode() {
  const queryClient = useQueryClient();
  return useMutation<InviteCode>({
    mutationFn: () =>
      apiClient("/invite-codes", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invite-codes"] });
    },
  });
}
