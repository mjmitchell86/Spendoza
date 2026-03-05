import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(`[errorHandler] ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: "Internal server error" });
}
