import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { isNotFoundError } from "@/lib/api-error";
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
      } catch (err) {
        // 404: the user isn't in a household. Anything else (a plan refusal,
        // a server error) is a real error, not "no household".
        if (isNotFoundError(err)) return null;
        throw err;
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
      void queryClient.invalidateQueries({ queryKey: ["household", "invitations"] });
    },
  });
}

export function useRotateInviteCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient("/household/invite-code", { method: "POST" }) as Promise<{
        invite_code: string;
      }>,
    onSuccess: ({ invite_code }) => {
      queryClient.setQueryData<HouseholdData | null>(["household"], (old) =>
        old ? { ...old, household: { ...old.household, invite_code } } : old,
      );
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

export function useTransferOwnership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { new_head_id: string }) =>
      apiClient("/household/transfer", { method: "POST", body: JSON.stringify(data) }),
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

export interface MyInvitation {
  id: string;
  household_name: string;
  inviter_name: string;
  expires_at: string;
}

export function useMyInvitations() {
  return useQuery<MyInvitation[]>({
    queryKey: ["household", "invitations", "mine"],
    queryFn: () => apiClient("/household/invitations/mine"),
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      apiClient(`/household/invitations/${id}/accept`, {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household"] });
    },
  });
}

export function useDeclineInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      apiClient(`/household/invitations/${id}/decline`, {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household", "invitations", "mine"] });
    },
  });
}

export interface HouseholdInvitation {
  id: string;
  email: string;
  created_at: string;
  expires_at: string;
}

export function useHouseholdInvitations() {
  return useQuery<HouseholdInvitation[]>({
    queryKey: ["household", "invitations"],
    queryFn: () => apiClient("/household/invitations"),
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiClient(`/household/invitations/${invitationId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household", "invitations"] });
    },
  });
}

export function useRenameHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      apiClient("/household", { method: "PATCH", body: JSON.stringify(data) }) as Promise<Household>,
    onSuccess: (household) => {
      queryClient.setQueryData<HouseholdData | null>(["household"], (old) =>
        old ? { ...old, household: { ...old.household, ...household } } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["household"] });
    },
  });
}

export function useDeleteHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { confirm_name: string }) =>
      apiClient("/household", { method: "DELETE", body: JSON.stringify(data) }),
    onSuccess: () => {
      // Show the no-household view immediately; the refetch confirms it.
      queryClient.setQueryData<HouseholdData | null>(["household"], null);
      queryClient.removeQueries({ queryKey: ["household", "invitations"] });
      void queryClient.invalidateQueries({ queryKey: ["household"] });
      // Household-scoped data went with it
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "household"] });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}
