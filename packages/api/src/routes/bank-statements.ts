import { Router, type Response } from "express";
import multer from "multer";
import { uploadBankStatementSchema } from "@spendoza/shared";
import { createSupabaseClient } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import { computeFileHash } from "../services/bank-statement.service";
import { processBankStatement } from "../services/ai-pipeline.service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// POST /upload — upload a bank statement PDF
// ---------------------------------------------------------------------------
router.post(
  "/upload",
  upload.single("file"),
  async (req, res: Response) => {
    const { user, accessToken } = req as AuthenticatedRequest;
    const supabase = createSupabaseClient(accessToken);

    // Validate metadata fields
    const parsed = uploadBankStatementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: "File is required" });
    }

    // Compute SHA-256 hash of the file buffer
    const fileHash = computeFileHash(file.buffer);

    // Check for duplicates
    const { data: existing } = await supabase
      .from("bank_statements")
      .select("id")
      .eq("user_id", user.id)
      .eq("file_hash", fileHash)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "Duplicate statement" });
    }

    // Upload to Supabase Storage
    const storagePath = `${user.id}/statements/${file.originalname}`;
    const { error: storageError } = await supabase.storage
      .from("bank-statements")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (storageError) {
      return res.status(500).json({ error: "Failed to upload file" });
    }

    // Insert record into bank_statements table
    const { data, error } = await supabase
      .from("bank_statements")
      .insert({
        user_id: user.id,
        file_path: storagePath,
        file_hash: fileHash,
        bank_name: parsed.data.bank_name ?? null,
        statement_month: parsed.data.statement_month,
        is_shared_account: parsed.data.is_shared_account,
        account_label: parsed.data.account_label ?? null,
        status: "uploaded",
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Process synchronously — Vercel kills serverless functions after response
    console.log(`[upload] statement ${data.id} inserted, starting AI processing`);
    await processBankStatement(data.id);
    console.log(`[upload] statement ${data.id} processing complete`);

    return res.status(201).json(data);
  }
);

// ---------------------------------------------------------------------------
// GET / — list user's bank statements
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { user, accessToken } = req as AuthenticatedRequest;
  const supabase = createSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("bank_statements")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// GET /:id — get statement with parsed transactions
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res: Response) => {
  const { user, accessToken } = req as AuthenticatedRequest;
  const supabase = createSupabaseClient(accessToken);

  const { data: statement, error } = await supabase
    .from("bank_statements")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !statement) {
    return res.status(404).json({ error: "Statement not found" });
  }

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .eq("bank_statement_id", statement.id);

  return res.status(200).json({ statement, transactions: transactions ?? [] });
});

// ---------------------------------------------------------------------------
// POST /:id/reprocess — re-trigger AI parsing
// ---------------------------------------------------------------------------
router.post("/:id/reprocess", async (req, res: Response) => {
  const { user, accessToken } = req as AuthenticatedRequest;
  const supabase = createSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("bank_statements")
    .update({ status: "uploaded" })
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Statement not found" });
  }

  // Process synchronously — Vercel kills serverless functions after response
  console.log(`[reprocess] statement ${data.id} starting AI processing`);
  await processBankStatement(data.id);
  console.log(`[reprocess] statement ${data.id} processing complete`);

  return res.status(200).json({ message: "Reprocessing complete" });
});

export default router;
