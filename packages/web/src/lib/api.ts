import { supabase } from "./supabase";

export const API_BASE = import.meta.env.VITE_API_URL ?? "";

export const IS_TEST_ENV = API_BASE.includes("test");

export async function apiClient(path: string, options?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE}/api${path}`, {
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

export async function apiClientBlob(path: string): Promise<Blob> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE}/api${path}`, {
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
    },
  });
  if (!response.ok) {
    let message = "API request failed";
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      // Response may not be JSON
    }
    throw new Error(message);
  }
  return response.blob();
}
