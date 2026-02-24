import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, API_BASE } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Profile, UpdateProfileInput } from "@spendoza/shared";

export function useProfile() {
  return useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: () => apiClient("/profile"),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProfileInput) =>
      apiClient("/profile", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/api/profile/avatar`, {
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
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
