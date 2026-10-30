import type { Request, Response, NextFunction } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_DISABLED_CODE, ACCOUNT_DISABLED_MESSAGE } from "@spendoza/shared";
import { supabaseAdmin, createSupabaseClient } from "../lib/supabase";

export interface AuthenticatedRequest extends Request<any, any, any, any> {
  user: { id: string; email: string };
  accessToken: string;
  supabase: SupabaseClient;
}

// Only an explicit `disabled === true` blocks. A missing row or a failed lookup lets the request through
// so a transient database error doesn't lock everyone out.
async function isDisabled(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("disabled")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("requireAuth: profile lookup failed:", error.message);
      return false;
    }
    return data?.disabled === true;
  } catch (err) {
    console.error("requireAuth: profile lookup failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.split(" ")[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (await isDisabled(user.id)) {
    return res.status(403).json({ error: ACCOUNT_DISABLED_MESSAGE, code: ACCOUNT_DISABLED_CODE });
  }

  (req as AuthenticatedRequest).user = { id: user.id, email: user.email! };
  (req as AuthenticatedRequest).accessToken = token;
  (req as AuthenticatedRequest).supabase = createSupabaseClient(token);

  next();
}
