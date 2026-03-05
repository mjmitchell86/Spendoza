import type { Request, Response, NextFunction } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin, createSupabaseClient } from "../lib/supabase";

export interface AuthenticatedRequest extends Request<any, any, any, any> {
  user: { id: string; email: string };
  accessToken: string;
  supabase: SupabaseClient;
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

  (req as AuthenticatedRequest).user = { id: user.id, email: user.email! };
  (req as AuthenticatedRequest).accessToken = token;
  (req as AuthenticatedRequest).supabase = createSupabaseClient(token);

  next();
}
