import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

export function CompleteStep() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleFinish() {
    setIsSubmitting(true);
    try {
      await apiClient("/profile/onboarding", { method: "PUT" });
      navigate("/dashboard", { replace: true, state: { onboardingCompleted: true } });
    } catch {
      // Even if the API call fails, navigate to dashboard
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
