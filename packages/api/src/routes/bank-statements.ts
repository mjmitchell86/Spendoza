import { Router, type Response } from "express";
import multer from "multer";
import { uploadBankStatementSchema } from "@spendoza/shared";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import { computeFileHash } from "../services/bank-statement.service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// POST /upload — upload a bank statement PDF
// ---------------------------------------------------------------------------
router.post(
  "/upload",
  upload.single("file"),
  async (req, res: Response) => {
    const { user, supabase: db } = req as AuthenticatedRequest;

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

    // Detect file type from mimetype / extension
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    let fileType: "pdf" | "csv";
    if (file.mimetype === "application/pdf" || ext === "pdf") {
      fileType = "pdf";
    } else if (file.mimetype === "text/csv" || (file.mimetype === "text/plain" && ext === "csv")) {
      fileType = "csv";
    } else {
      return res.status(400).json({ error: "Only PDF and CSV files are supported" });
    }

    // Compute SHA-256 hash of the file buffer
    const fileHash = computeFileHash(file.buffer);

    // Check for duplicates
    const { data: existing } = await db
      .from("bank_statements")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("file_hash", fileHash)
      .maybeSingle();

    if (existing) {
      if (existing.status === "failed") {
        // Allow re-upload by deleting the failed record first
        await db
          .from("bank_statements")
          .delete()
          .eq("id", existing.id);
      } else {
        return res.status(409).json({ error: "Duplicate statement" });
      }
    }

    // Upload to Supabase Storage
    const storagePath = `${user.id}/statements/${file.originalname}`;
    const { error: storageError } = await supabaseAdmin.storage
      .from("bank-statements")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (storageError) {
      console.error(`[upload] storage error: ${storageError.message}`);
      return res.status(500).json({ error: "Failed to upload file" });
    }

    // Insert record into bank_statements table
    const { data, error } = await db
      .from("bank_statements")
      .insert({
        user_id: user.id,
        file_path: storagePath,
        file_hash: fileHash,
        file_type: fileType,
        bank_name: parsed.data.bank_name ?? null,
        statement_month: null,
        is_shared_account: parsed.data.is_shared_account,
        account_label: parsed.data.account_label ?? null,
        status: "processing",
        parsed_data: { pipeline_step: "extract_text" },
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log(`[upload] statement ${data.id} inserted, pipeline trigger will fire`);

    return res.status(201).json(data);
  }
);

// ---------------------------------------------------------------------------
// GET / — list user's bank statements
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  const { data, error } = await db
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
  const { user, supabase: db } = req as AuthenticatedRequest;

  const { data: statement, error } = await db
    .from("bank_statements")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !statement) {
    return res.status(404).json({ error: "Statement not found" });
  }

  const { data: transactions } = await db
    .from("transactions")
    .select("*")
    .eq("bank_statement_id", statement.id);

  return res.status(200).json({ statement, transactions: transactions ?? [] });
});

// ---------------------------------------------------------------------------
// POST /:id/reprocess — re-trigger AI parsing
// ---------------------------------------------------------------------------
router.post("/:id/reprocess", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  // Look up the statement first to determine file type
  const { data: existing } = await db
    .from("bank_statements")
    .select("file_type")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .single();

  // CSVs already have text stored, so start at extract_transactions
  const startStep = existing?.file_type === "csv" ? "extract_transactions" : "extract_text";

  const { data, error } = await db
    .from("bank_statements")
    .update({
      status: "processing",
      parsed_data: { pipeline_step: startStep },
    })
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Statement not found" });
  }

  console.log(`[reprocess] statement ${data.id} pipeline trigger will fire`);

  return res.status(200).json({ message: "Reprocessing started" });
});

// ---------------------------------------------------------------------------
// DELETE /:id — remove a failed statement
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  const { data: statement } = await db
    .from("bank_statements")
    .select("id, status, file_hash")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .single();

  if (!statement) {
    return res.status(404).json({ error: "Statement not found" });
  }

  if (statement.status !== "failed") {
    return res.status(400).json({ error: "Only failed statements can be deleted" });
  }

  // Delete child records from multi-month splits (CASCADE removes their transactions)
  await db
    .from("bank_statements")
    .delete()
    .eq("user_id", user.id)
    .like("file_hash", `${statement.file_hash}:%`);

  await db
    .from("bank_statements")
    .delete()
    .eq("id", statement.id);

  return res.status(204).send();
});

export default router;
