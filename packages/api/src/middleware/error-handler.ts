import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(`[errorHandler] ${req.method} ${req.originalUrl}:`, err);
  // A response is already on its way: let Express's default handler close the
  // connection rather than trying to send a second one.
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error" });
}
