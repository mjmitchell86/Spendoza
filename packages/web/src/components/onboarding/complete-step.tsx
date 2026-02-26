import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api";

export function CompleteStep() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailReports, setEmailReports] = useState(true);

  async function handleFinish() {
    setIsSubmitting(true);
    try {
      // Sync timezone and email preference
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await apiClient("/profile", {
        method: "PUT",
        body: JSON.stringify({
          timezone,
          email_reports_enabled: emailReports,
        }),
      });

      await apiClient("/profile/onboarding", { method: "PUT" });
      navigate("/dashboard", { replace: true, state: { onboardingCompleted: true } });
    } catch {
      navigate("/dashboard", { replace: true, state: { onboardingCompleted: true } });
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <CheckCircle2 className="size-20 text-green-500" />

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">You're All Set!</h2>
        <p className="text-muted-foreground">
          Your account is ready. Head to your dashboard to start tracking your
          finances.
        </p>
      </div>

      {/* Email reports toggle */}
      <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
        <Mail className="size-5 text-muted-foreground" />
        <Label htmlFor="email-reports" className="cursor-pointer text-sm">
          Email me weekly Spendoza Reports
        </Label>
        <Switch
          id="email-reports"
          checked={emailReports}
          onCheckedChange={setEmailReports}
        />
      </div>

      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={handleFinish} disabled={isSubmitting}>
          {isSubmitting ? "Setting up..." : "Go to Dashboard"}
        </Button>
        <p className="text-xs text-muted-foreground">
          You can always update your settings and upload more statements later.
        </p>
      </div>
    </div>
  );
}
