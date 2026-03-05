import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const { user, supabase: db } = req as AuthenticatedRequest;

  try {
    console.error(`[requireAdmin] checking admin for user ${user.id}, path: ${req.originalUrl}`);
    const { data: profile, error } = await db
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    console.error(`[requireAdmin] result:`, { profile, error: error?.message });

    if (!profile?.is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    next();
  } catch (err) {
    console.error(`[requireAdmin] THREW:`, err);
    return res.status(500).json({ error: "Admin check failed" });
  }
}
