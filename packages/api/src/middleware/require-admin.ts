import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const { user, supabase: db } = req as AuthenticatedRequest;

  const { data: profile } = await db
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
}
