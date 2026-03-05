import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  console.error(`[requireAdmin] ENTERED: ${req.method} ${req.originalUrl}`);
  const { user, supabase: db } = req as AuthenticatedRequest;

  try {
    const { data: profile, error } = await db
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (error || !profile?.is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    next();
  } catch (err) {
    console.error(`[requireAdmin] error:`, err);
    return res.status(500).json({ error: "Admin check failed" });
  }
}
