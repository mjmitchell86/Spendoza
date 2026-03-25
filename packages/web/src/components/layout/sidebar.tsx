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
  MessageCircle,
  ShieldAlert,
  Info,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";

const navSections = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/income", label: "Income", icon: TrendingUp },
      { to: "/expenses", label: "Expenses", icon: TrendingDown },
      { to: "/categories", label: "Categories", icon: Tags },
      { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { to: "/bank-statements", label: "Bank Statements", icon: FileText },
    ],
  },
  {
    label: "Planning",
    items: [
      { to: "/goals", label: "Goals", icon: Target },
      { to: "/debts", label: "Debts", icon: Landmark },
      { to: "/advice", label: "Advisor", icon: MessageCircle },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/household", label: "Household", icon: Users },
      { to: "/billing", label: "Billing", icon: CreditCard },
      { to: "/mcp", label: "MCP", icon: Cpu },
      { to: "/about", label: "About", icon: Info },
    ],
  },
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
      {/* Branding */}
      <div className="mb-3 px-3">
        <span className="text-lg font-bold tracking-tight text-primary">
          Spendoza
        </span>
      </div>

      {navSections.map((section) => (
        <div key={section.label} className="mb-2">
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {section.label}
          </p>
          {section.items.map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to + search}
                onClick={onNavigate}
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-primary"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "text-primary" : ""
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
      {profile?.is_admin && (
        <>
          <div className="mx-3 my-2 border-t border-sidebar-border" />
          <Link
            to="/admin"
            onClick={onNavigate}
            className={cn(
              "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all",
              location.pathname.startsWith("/admin")
                ? "bg-primary/10 text-primary before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-primary"
                : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <ShieldAlert
              className={cn(
                "size-4 shrink-0",
                location.pathname.startsWith("/admin") ? "text-primary" : ""
              )}
            />
            Admin
          </Link>
        </>
      )}
    </nav>
  );
}
