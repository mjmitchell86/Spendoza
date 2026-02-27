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

const MAX_AVATAR_DIMENSION = 512;
const AVATAR_QUALITY = 0.85;

/** Resize / compress an image client-side so it stays well under 2 MB. */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return canvas.convertToBlob({ type: "image/jpeg", quality: AVATAR_QUALITY });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const compressed = await compressImage(file);

      const formData = new FormData();
      formData.append("file", compressed, "avatar.jpg");
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
