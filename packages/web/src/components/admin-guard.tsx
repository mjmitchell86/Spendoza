import { Navigate, Outlet } from "react-router-dom";
import { useProfile } from "@/hooks/use-profile";
import { Loader2 } from "lucide-react";

export function AdminGuard() {
  const { data: profile, isLoading } = useProfile();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
