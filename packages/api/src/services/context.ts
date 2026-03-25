// packages/api/src/services/context.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";

export interface ServiceContext {
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
  userId: string;
  email: string;
}

export function toServiceContext(req: AuthenticatedRequest): ServiceContext {
  return {
    supabase: req.supabase,
    supabaseAdmin,
    userId: req.user.id,
    email: req.user.email,
  };
}
