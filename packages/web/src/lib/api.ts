import { supabase } from "./supabase";

export async function apiClient(path: string, options?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "API request failed");
  }
  return response.json();
}
