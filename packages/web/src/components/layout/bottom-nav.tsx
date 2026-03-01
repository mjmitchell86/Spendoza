import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Target,
  MoreHorizontal,
  Tags,
  FileText,
  Users,
  ArrowLeftRight,
  CreditCard,
  Landmark,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const primaryTabs = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/income", label: "Income", icon: TrendingUp },
  { to: "/expenses", label: "Expenses", icon: TrendingDown },
  { to: "/goals", label: "Goals", icon: Target },
];

const moreItems = [
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/bank-statements", label: "Bank Statements", icon: FileText },
  { to: "/debts", label: "Debts", icon: Landmark },
  { to: "/household", label: "Household", icon: Users },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/about", label: "About", icon: Info },
];

export function BottomNav() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const periodParam = searchParams.get("period");
  const search = periodParam ? `?period=${periodParam}` : "";

  const isMoreActive = moreItems.some(
    (item) => location.pathname === item.to
  );

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="flex items-center justify-around px-2 py-1">
          {primaryTabs.map((tab) => {
            const isActive = location.pathname === tab.to;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to + search}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-5" />
                {tab.label}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium transition-colors",
              isMoreActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MoreHorizontal className="size-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 py-4">
            {moreItems.map((item) => {
              const isActive = location.pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to + search}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg p-3 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
