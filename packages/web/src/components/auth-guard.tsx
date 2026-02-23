import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api";
import { Loader2 } from "lucide-react";

export function AuthGuard() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();

  const [initialLoading, setInitialLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(
    null
  );

  useEffect(() => {
    if (!user) {
      setInitialLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      try {
        const profile = await apiClient("/profile");
        if (!cancelled) {
          setOnboardingCompleted(profile.onboarding_completed ?? false);
        }
      } catch {
        // If profile fetch fails, assume onboarding not completed
        if (!cancelled) {
          setOnboardingCompleted(false);
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Show spinner while auth or profile is loading
  if (authLoading || (user && initialLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If no user, redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If onboarding not completed, redirect to onboarding
  // (unless already on the onboarding page)
  if (onboardingCompleted === false && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
