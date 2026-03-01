import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Tags,
  FileText,
  Users,
  ArrowLeftRight,
  Target,
  CreditCard,
  Landmark,
  ShieldAlert,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/income", label: "Income", icon: TrendingUp },
  { to: "/expenses", label: "Expenses", icon: TrendingDown },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/bank-statements", label: "Bank Statements", icon: FileText },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/debts", label: "Debts", icon: Landmark },
  { to: "/household", label: "Household", icon: Users },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/about", label: "About", icon: Info },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data: profile } = useProfile();
  const periodParam = searchParams.get("period");
  const search = periodParam ? `?period=${periodParam}` : "";

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {navItems.map((item) => {
        const isActive = location.pathname === item.to;
        const Icon = item.icon;

        return (
          <Link
            key={item.to}
            to={item.to + search}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
      {profile?.is_admin && (
        <>
          <div className="mx-3 my-2 border-t" />
          <Link
            to="/admin"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              location.pathname.startsWith("/admin")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <ShieldAlert className="size-4 shrink-0" />
            Admin
          </Link>
        </>
      )}
    </nav>
  );
}
