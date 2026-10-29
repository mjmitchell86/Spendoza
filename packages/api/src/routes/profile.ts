import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";

import { updateProfileSchema, deleteAccountSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import { generateUserReport, generateHouseholdReport } from "../services/report.service";
import { getProfile, updateProfile } from "../services/profile.service";
import { toServiceContext } from "../services/context";
import { deleteAccount, AccountDeletionError } from "../services/account.service";

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (client compresses before upload)
});

const router = Router();

// ---------------------------------------------------------------------------
// GET / — get authenticated user's profile
// ---------------------------------------------------------------------------
router.get("/", async (req, res: Response) => {
  const { data, error } = await getProfile(toServiceContext(req as AuthenticatedRequest));

  if (error || !data) {
    return res.status(404).json({ error: "Profile not found" });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// PUT / — update profile fields
// ---------------------------------------------------------------------------
router.put("/", validate(updateProfileSchema), async (req, res: Response) => {
  const { data, error } = await updateProfile(
    toServiceContext(req as AuthenticatedRequest),
    req.body
  );

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// DELETE / — permanently delete the authenticated user's account and data
// Body: { confirm: "DELETE" }
// ---------------------------------------------------------------------------
router.delete("/", validate(deleteAccountSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  try {
    await deleteAccount(user.id);
  } catch (err) {
    if (err instanceof AccountDeletionError) {
      const status =
        err.code === "HOUSEHOLD_HEAD_HAS_MEMBERS" ? 409 : err.code === "NOT_FOUND" ? 404 : 500;
      return res.status(status).json({ error: err.message });
    }
    console.error(`[profile] account deletion failed for ${user.id}:`, err);
    return res.status(500).json({ error: "Account deletion failed" });
  }

  return res.status(200).json({ deleted: true });
});

// ---------------------------------------------------------------------------
// POST /sign-out-others — end every session except the caller's
//
// Backs "Disconnect AI assistants": connected MCP clients hold ordinary
// Supabase sessions for this user, so revoking the other sessions (scope
// "others") disconnects them along with any other signed-in devices. Their
// refresh tokens stop working immediately; access tokens they already hold
// stay valid until they expire (one hour by default).
// ---------------------------------------------------------------------------
router.post("/sign-out-others", async (req, res: Response) => {
  const { user, accessToken } = req as AuthenticatedRequest;

  const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, "others");

  if (error) {
    if (error.status === 401 || error.status === 403) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    console.error(`[profile] sign-out-others failed for ${user.id}: ${error.message}`);
    return res.status(500).json({ error: "Could not sign out other sessions. Please try again." });
  }

  return res.status(200).json({ signed_out_others: true });
});

// ---------------------------------------------------------------------------
// PUT /onboarding — mark onboarding complete
// ---------------------------------------------------------------------------
router.put("/onboarding", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  // onboarding_completed is server-owned (clients have no UPDATE grant on it),
  // so it is set with the service role, scoped to the caller's own row.
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
    const { user, supabase: db } = req as AuthenticatedRequest;
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

    const { data, error } = await db
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
