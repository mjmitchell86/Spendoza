import { Router, type Response } from "express";
import multer from "multer";
import { uploadBankStatementSchema } from "@spendoza/shared";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import { computeFileHash, listBankStatements, getBankStatement } from "../services/bank-statement.service";
import { toServiceContext } from "../services/context";
import {
  isOwnedStatementPath,
  isStatementFileNeeded,
  removeStatementFile,
} from "../services/statement-file.service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// bank_statements rows are server-owned: clients can read their own rows but
// not write them, so writes go through supabaseAdmin scoped by user_id.

/**
 * Remove a failed statement: its uploaded file, its multi-month split children,
 * and its row. The file is deleted first (unless another statement still needs
 * the shared file), so if storage fails nothing is removed and the user can retry.
 * A file_path outside the user's statements folder is never touched.
 */
async function removeFailedStatement(
  userId: string,
  statement: { id: string; file_hash: string; file_path: string }
): Promise<{ error: string | null }> {
  const { data: children, error: childrenError } = await supabaseAdmin
    .from("bank_statements")
    .select("id")
    .eq("user_id", userId)
    .like("file_hash", `${statement.file_hash}:%`);

  if (childrenError) {
    return { error: childrenError.message };
  }

  const removedIds = [statement.id, ...(children ?? []).map((c: { id: string }) => c.id)];

  let fileKept = false;
  if (!isOwnedStatementPath(userId, statement.file_path)) {
    console.error(`[bank-statements] statement ${statement.id} has a file_path outside the user's folder; not deleting it`);
  } else {
    try {
      if (await isStatementFileNeeded(userId, statement.file_path, removedIds)) {
        fileKept = true;
      } else {
        const { error: storageError } = await removeStatementFile(userId, statement.file_path);
        if (storageError) {
          return { error: storageError };
        }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Delete child records from multi-month splits (CASCADE removes their transactions)
  await supabaseAdmin
    .from("bank_statements")
    .delete()
    .eq("user_id", userId)
    .like("file_hash", `${statement.file_hash}:%`);

  await supabaseAdmin
    .from("bank_statements")
    .delete()
    .eq("id", statement.id)
    .eq("user_id", userId);

  // A sibling that needed the shared file may have finished while we were
  // removing rows (it saw this statement still present), so re-check.
  if (fileKept) {
    try {
      if (!(await isStatementFileNeeded(userId, statement.file_path, []))) {
        const { error: storageError } = await removeStatementFile(userId, statement.file_path);
        if (storageError) {
          console.error(`[bank-statements] failed to delete file ${statement.file_path}: ${storageError}`);
        }
      }
    } catch (err) {
      console.error(`[bank-statements] file reference re-check failed for ${statement.file_path}:`, err);
    }
  }

  return { error: null };
}

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
      .select("id, status, file_hash, file_path")
      .eq("user_id", user.id)
      .eq("file_hash", fileHash)
      .maybeSingle();

    if (existing) {
      if (existing.status === "failed") {
        // Allow re-upload by removing the failed record and its file first
        const { error: removeError } = await removeFailedStatement(user.id, existing);
        if (removeError) {
          console.error(`[upload] failed to remove failed statement ${existing.id}: ${removeError}`);
          return res.status(500).json({ error: "Failed to upload file" });
        }
      } else {
        return res.status(409).json({ error: "Duplicate statement" });
      }
    }

    // Upload to Supabase Storage
    const storagePath = `${user.id}/statements/${file.originalname}`;
    if (!isOwnedStatementPath(user.id, storagePath)) {
      return res.status(400).json({ error: "Invalid file name" });
    }
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
    const { data, error } = await supabaseAdmin
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
      // Don't leave the uploaded file in storage without a statement record
      const { error: cleanupError } = await removeStatementFile(user.id, storagePath);
      if (cleanupError) {
        console.error(`[upload] failed to remove orphaned file ${storagePath}: ${cleanupError}`);
      }
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
  const { data, error } = await listBankStatements(
    toServiceContext(req as AuthenticatedRequest)
  );

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// GET /:id — get statement with parsed transactions
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res: Response) => {
  const { statement, transactions, error } = await getBankStatement(
    toServiceContext(req as AuthenticatedRequest),
    req.params.id
  );

  if (error || !statement) {
    return res.status(404).json({ error: "Statement not found" });
  }

  return res.status(200).json({ statement, transactions });
});

// ---------------------------------------------------------------------------
// POST /:id/reprocess — re-trigger AI parsing
// ---------------------------------------------------------------------------
router.post("/:id/reprocess", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  // Always restart from extract_text: a failure discards intermediate text, but
  // the uploaded file is kept until success or removal, so re-read it (for CSVs
  // this re-runs splitting, or re-derives a split child's month).
  const { data, error } = await supabaseAdmin
    .from("bank_statements")
    .update({
      status: "processing",
      parsed_data: { pipeline_step: "extract_text" },
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
    .select("id, status, file_hash, file_path")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .single();

  if (!statement) {
    return res.status(404).json({ error: "Statement not found" });
  }

  if (statement.status !== "failed") {
    return res.status(400).json({ error: "Only failed statements can be deleted" });
  }

  const { error: removeError } = await removeFailedStatement(user.id, statement);
  if (removeError) {
    console.error(`[delete] failed to remove statement ${statement.id}: ${removeError}`);
    return res.status(500).json({ error: "Failed to remove statement" });
  }

  return res.status(204).send();
});

export default router;
