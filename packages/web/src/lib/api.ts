import { ACCOUNT_DISABLED_CODE } from "@spendoza/shared";
import { supabase } from "./supabase";
import { ApiError } from "./api-error";

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
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Response may not be JSON
    }
    const message =
      (body as { error?: string } | null)?.error || "API request failed";
    if (
      response.status === 403 &&
      (body as { code?: string } | null)?.code === ACCOUNT_DISABLED_CODE
    ) {
      // The account was disabled while signed in: end the session and say why on Sign in.
      await supabase.auth.signOut();
      window.location.assign(`/login?notice=${ACCOUNT_DISABLED_CODE}`);
    }
    throw new ApiError(message, response.status, body);
  }
  // 204 No Content (deletes, revokes) has no body to parse.
  if (response.status === 204) return undefined;
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
