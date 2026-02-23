import { Router, type Request, type Response } from "express";
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

  // Return 200 immediately, run step in background
  res.status(200).json({ message: "Step accepted", statement_id, step });

  // Execute the step after responding
  executeStep(statement_id, step).catch((err) =>
    console.error(`[internal] Failed to execute step ${step} for ${statement_id}:`, err)
  );
});

export default router;
