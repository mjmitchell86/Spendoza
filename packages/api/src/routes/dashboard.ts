import { Router, type Request, type Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { toServiceContext } from "../services/context";
import {
  currentMonthStr,
  getPersonalDashboardForMonth,
  getPersonalDashboardForRange,
  getHouseholdDashboardForMonth,
  getHouseholdDashboardForRange,
} from "../services/dashboard.service";

const router = Router();

// ---------------------------------------------------------------------------
// GET /personal — personal dashboard data
// ---------------------------------------------------------------------------
router.get("/personal", async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const fromDate = req.query.from_date as string | undefined;
  const toDate = req.query.to_date as string | undefined;

  if (fromDate || toDate) {
    const dashboard = await getPersonalDashboardForRange(ctx, fromDate, toDate);
    return res.status(200).json(dashboard);
  }

  const month = (req.query.month as string) ?? currentMonthStr();
  const dashboard = await getPersonalDashboardForMonth(ctx, month);
  return res.status(200).json(dashboard);
});

// ---------------------------------------------------------------------------
// GET /household — household dashboard data
// ---------------------------------------------------------------------------
router.get("/household", async (req: Request, res: Response) => {
  const ctx = toServiceContext(req as AuthenticatedRequest);
  const fromDate = req.query.from_date as string | undefined;
  const toDate = req.query.to_date as string | undefined;

  // Look up user's household
  const { data: profile } = await ctx.supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", ctx.userId)
    .single();

  if (!profile?.household_id) {
    return res
      .status(400)
      .json({ error: "You are not a member of a household" });
  }

  const householdId = profile.household_id;

  if (fromDate || toDate) {
    const dashboard = await getHouseholdDashboardForRange(ctx, householdId, fromDate, toDate);
    return res.status(200).json(dashboard);
  }

  const month = (req.query.month as string) ?? currentMonthStr();
  const dashboard = await getHouseholdDashboardForMonth(ctx, householdId, month);
  return res.status(200).json(dashboard);
});

export default router;
