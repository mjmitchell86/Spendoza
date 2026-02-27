import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";

import { updateProfileSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import { generateUserReport, generateHouseholdReport } from "../services/report.service";

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (client compresses before upload)
});

const router = Router();

// ---------------------------------------------------------------------------
// GET / — get authenticated user's profile
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Profile not found" });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// PUT / — update profile fields
// ---------------------------------------------------------------------------
router.put("/", validate(updateProfileSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(req.body)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// PUT /onboarding — mark onboarding complete
// ---------------------------------------------------------------------------
router.put("/onboarding", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // Trigger report generation for current and previous month (non-blocking)
  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const lastMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));

  void (async () => {
    try {
      await generateUserReport(user.id, thisMonth, true);
      await generateUserReport(user.id, lastMonth, true);

      if (data.household_id) {
        // Find all months with user reports (from AI pipeline + above)
        const { data: userReports } = await supabaseAdmin
          .from("reports")
          .select("report_month")
          .eq("entity_type", "user")
          .eq("entity_id", user.id);

        const months = [...new Set((userReports ?? []).map(r => r.report_month))];
        for (const month of months) {
          await generateHouseholdReport(
            data.household_id,
            new Date(month + "T00:00:00Z"),
            true
          );
        }
      }
    } catch (err) {
      console.error(`[onboarding] report generation failed for ${user.id}:`, err);
    }
  })();

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST /avatar — upload profile image
// ---------------------------------------------------------------------------
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

router.post(
  "/avatar",
  (req: Request, res: Response, next: NextFunction) => {
    avatarUpload.single("file")(req, res, (err: any) => {
      if (err && err.name === "MulterError") {
        return res.status(400).json({
          error: err.code === "LIMIT_FILE_SIZE"
            ? "File too large (max 5 MB)"
            : `Upload error: ${err.message}`,
        });
      }
      if (err) {
        return res.status(500).json({ error: "Upload failed" });
      }
      next();
    });
  },
  async (req, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      return res.status(400).json({ error: "File is required" });
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ error: "Only JPEG, PNG, and WebP images are allowed" });
    }

    const ext = file.mimetype.split("/")[1] === "jpeg" ? "jpg" : file.mimetype.split("/")[1];
    const storagePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("avatars")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      return res.status(500).json({ error: "Failed to upload avatar" });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("avatars")
      .getPublicUrl(storagePath);

    // Append cache-buster so browsers pick up new avatars
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json(data);
  }
);

export default router;
