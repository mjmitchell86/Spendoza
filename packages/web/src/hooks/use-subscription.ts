import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Subscription } from "@spendoza/shared";

export function useSubscription() {
  return useQuery<Subscription>({
    queryKey: ["subscription"],
    queryFn: () => apiClient("/billing/subscription"),
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (priceId: string) => {
      const data = await apiClient("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ price_id: priceId }),
      });
      return data as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });
}

export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const data = await apiClient("/billing/portal", { method: "POST" });
      return data as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });
}
