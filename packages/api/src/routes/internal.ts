import { Router, type Request, type Response } from "express";
import { waitUntil } from "@vercel/functions";
import { executeStep } from "../services/ai-pipeline.service";

const router = Router();

// ---------------------------------------------------------------------------
// POST /process-step — called by pg_net trigger to run a pipeline step
// ---------------------------------------------------------------------------
router.post("/process-step", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { statement_id, step } = req.body;

  if (!statement_id || !step) {
    return res.status(400).json({ error: "statement_id and step are required" });
  }

  // Return 200 immediately so pg_net doesn't wait, but keep the
  // function alive via waitUntil so Vercel doesn't kill it.
  waitUntil(
    executeStep(statement_id, step).catch((err) =>
      console.error(`[internal] Failed to execute step ${step} for ${statement_id}:`, err)
    )
  );

  return res.status(200).json({ message: "Step accepted", statement_id, step });
});

export default router;
