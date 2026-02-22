import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type {
  CreateHouseholdInput,
  Household,
  HouseholdMember,
  JoinHouseholdInput,
  UpdateSharingInput,
} from "@spendoza/shared";

export interface HouseholdData {
  household: Household;
  members: HouseholdMember[];
}

export function useHousehold() {
  return useQuery<HouseholdData | null>({
    queryKey: ["household"],
    queryFn: async () => {
      try {
        return await apiClient("/household");
      } catch {
        // User may not be in a household — return null
        return null;
      }
    },
  });
}

export function useCreateHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateHouseholdInput) =>
      apiClient("/household", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household"] });
    },
  });
}

export function useJoinHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: JoinHouseholdInput) =>
      apiClient("/household/join", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household"] });
    },
  });
}

export function useInviteToHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string }) =>
      apiClient("/household/invite", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household"] });
    },
  });
}

export function useUpdateSharing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateSharingInput) =>
      apiClient("/household/sharing", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household"] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      apiClient(`/household/members/${memberId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household"] });
    },
  });
}

export function useLeaveHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient("/household/leave", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household"] });
    },
  });
}
