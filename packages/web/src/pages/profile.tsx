import { useState, useRef, type FormEvent } from "react";
import { Camera, Check, Loader2, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/use-auth";
import { useProfile, useUpdateProfile, useUploadAvatar } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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
  const { theme, setTheme } = useTheme();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
    </div>
  );
}
