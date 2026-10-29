import { useState, useRef, type FormEvent } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  CreditCard,
  Loader2,
  Mail,
  Monitor,
  Moon,
  Sun,
  Trash2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { DELETE_ACCOUNT_CONFIRMATION } from "@spendoza/shared";
import { useAuth } from "@/hooks/use-auth";
import {
  useDeleteAccount,
  useProfile,
  useUpdateProfile,
  useUploadAvatar,
} from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiClient, IS_TEST_ENV } from "@/lib/api";

const DAY_OPTIONS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
] as const;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: new Date(2026, 0, 1, i).toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  }),
}));

const THEME_OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function ProfilePage() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleSendTestEmail() {
    setSendingEmail(true);
    setEmailError(null);
    setEmailSent(false);
    try {
      await apiClient("/emails/send-test", { method: "POST" });
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 5000);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSendingEmail(false);
    }
  }

  function handleDeleteOpenChange(open: boolean) {
    if (deleteAccount.isPending) return;
    setDeleteOpen(open);
    if (!open) {
      setDeleteConfirmText("");
      deleteAccount.reset();
    }
  }

  async function handleDeleteAccount(e: FormEvent) {
    e.preventDefault();
    if (deleteConfirmText !== DELETE_ACCOUNT_CONFIRMATION) return;
    try {
      await deleteAccount.mutateAsync({ confirm: DELETE_ACCOUNT_CONFIRMATION });
    } catch {
      // Error (e.g. must transfer household ownership first) is shown in the dialog
      return;
    }
    // Leave the authenticated area before clearing the session so the auth
    // guard doesn't redirect to /login first.
    navigate("/about", { replace: true });
    await deleteAccount.clearLocalSession();
  }

  // Use local state if user has edited, otherwise profile data
  const currentName = displayName ?? profile?.display_name ?? "";

  const initials = currentName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  const hasNameChanged = displayName !== null && displayName !== profile?.display_name;

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    if (!hasNameChanged) return;
    await updateProfile.mutateAsync({ display_name: displayName! });
    setDisplayName(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  async function handleAvatarChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) return;
    await uploadAvatar.mutateAsync(file);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveName} className="flex flex-col gap-6">
            {/* Avatar */}
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={handleAvatarClick}
                className="group relative shrink-0"
                disabled={uploadAvatar.isPending}
              >
                <Avatar className="size-20">
                  {profile?.avatar_url && (
                    <AvatarImage src={profile.avatar_url} alt={currentName} />
                  )}
                  <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "absolute inset-0 flex items-center justify-center rounded-full bg-black/50 transition-opacity",
                    uploadAvatar.isPending
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  {uploadAvatar.isPending ? (
                    <Loader2 className="size-5 animate-spin text-white" />
                  ) : (
                    <Camera className="size-5 text-white" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleAvatarChange(e.target.files)}
                  className="hidden"
                />
              </button>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{currentName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground">
                  Click avatar to upload a new photo
                </p>
                {uploadAvatar.isError && (
                  <p className="text-xs text-destructive">
                    {uploadAvatar.error instanceof Error
                      ? uploadAvatar.error.message
                      : "Upload failed"}
                  </p>
                )}
              </div>
            </div>

            {/* Display Name */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="display_name">Display Name</Label>
              <div className="flex gap-2">
                <Input
                  id="display_name"
                  value={currentName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="max-w-sm"
                />
                <Button
                  type="submit"
                  disabled={!hasNameChanged || updateProfile.isPending}
                  size="sm"
                >
                  {updateProfile.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : saved ? (
                    <>
                      <Check className="size-4" />
                      Saved
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Label>Theme</Label>
            <div className="flex gap-2">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm transition-colors",
                    theme === value
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4" />
            Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium capitalize">
                {profile?.subscription_tier ?? "free"} Plan
              </p>
              <p className="text-sm text-muted-foreground">
                {profile?.subscription_tier === "free"
                  ? "Upgrade to unlock more features"
                  : "Manage your subscription and billing"}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to={profile?.subscription_tier === "free" ? "/pricing" : "/billing"}>
                {profile?.subscription_tier === "free" ? "Upgrade" : "Manage"}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Label htmlFor="email-reports" className="cursor-pointer">
                  Weekly Email Reports
                </Label>
                <p className="text-xs text-muted-foreground">
                  Receive your Spendoza financial report via email
                </p>
              </div>
              <Switch
                id="email-reports"
                checked={profile?.email_reports_enabled ?? true}
                onCheckedChange={(checked) =>
                  updateProfile.mutate({ email_reports_enabled: checked })
                }
              />
            </div>
            {profile?.email_reports_enabled && (
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">Report Schedule</p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">
                      Day
                    </Label>
                    <Select
                      value={profile?.email_report_day ?? "saturday"}
                      onValueChange={(value) =>
                        updateProfile.mutate({
                          email_report_day: value as any,
                        })
                      }
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">
                      Time
                    </Label>
                    <Select
                      value={String(profile?.email_report_hour ?? 9)}
                      onValueChange={(value) =>
                        updateProfile.mutate({
                          email_report_hour: parseInt(value, 10),
                        })
                      }
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOUR_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Receive your report every{" "}
                  {DAY_OPTIONS.find(
                    (d) =>
                      d.value ===
                      (profile?.email_report_day ?? "saturday")
                  )?.label ?? "Saturday"}{" "}
                  at{" "}
                  {HOUR_OPTIONS.find(
                    (h) =>
                      h.value ===
                      String(profile?.email_report_hour ?? 9)
                  )?.label ?? "9 AM"}
                  {profile?.timezone ? ` (${profile.timezone})` : ""}
                </p>
              </div>
            )}
            {IS_TEST_ENV && (
              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-yellow-500/50 bg-yellow-500/5 p-4">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                  Test Environment
                </p>
                <p className="text-xs text-muted-foreground">
                  Send yourself a report email now to verify the email pipeline.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  disabled={sendingEmail}
                  onClick={handleSendTestEmail}
                >
                  {sendingEmail ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : emailSent ? (
                    <>
                      <Check className="size-4" />
                      Email Sent
                    </>
                  ) : (
                    <>
                      <Mail className="size-4" />
                      Send Test Email
                    </>
                  )}
                </Button>
                {emailError && (
                  <p className="text-xs text-destructive">{emailError}</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="font-medium">
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Delete my account</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all of your data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="w-fit"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete my account
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={handleDeleteOpenChange}>
        <DialogContent>
          <form onSubmit={handleDeleteAccount} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This permanently deletes your account and your data: profile, statements and
                transactions, income, expenses, goals, debts, reports, advice history, email
                settings and uploaded files, and cancels any subscription. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-confirm">
                Type <span className="font-mono font-semibold">{DELETE_ACCOUNT_CONFIRMATION}</span>{" "}
                to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                autoComplete="off"
                autoFocus
                disabled={deleteAccount.isPending}
              />
            </div>
            {deleteAccount.isError && (
              <p className="text-sm text-destructive">
                {deleteAccount.error instanceof Error
                  ? deleteAccount.error.message
                  : "Failed to delete account"}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDeleteOpenChange(false)}
                disabled={deleteAccount.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  deleteConfirmText !== DELETE_ACCOUNT_CONFIRMATION || deleteAccount.isPending
                }
              >
                {deleteAccount.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete my account"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
