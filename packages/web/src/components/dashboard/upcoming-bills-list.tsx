import { CalendarClock, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api";

interface RecurringExpense {
  id: string;
  description: string;
  friendly_name: string | null;
  amount: number;
  next_due_date: string;
  auto_detected: boolean;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateString: string) {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getDaysUntil(dateString: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString + "T00:00:00");
  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getUrgencyStyle(daysUntil: number) {
  if (daysUntil < 0) return { border: "border-l-rose-500", bg: "bg-rose-500/5" };
  if (daysUntil <= 3) return { border: "border-l-amber-500", bg: "bg-amber-500/5" };
  return { border: "", bg: "" };
}

export function UpcomingBillsList() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: bills, isLoading } = useQuery<RecurringExpense[]>({
    queryKey: ["expenses", "upcoming"],
    queryFn: () =>
      apiClient(`/expenses?frequency=recurring&from_date=${today}`),
  });

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle>Upcoming Bills</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !bills || bills.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No upcoming bills found
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {bills.map((bill) => {
              const daysUntil = getDaysUntil(bill.next_due_date);
              const urgency = getUrgencyStyle(daysUntil);
              return (
                <div
                  key={bill.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3",
                    urgency.border && `border-l-4 ${urgency.border}`,
                    urgency.bg
                  )}
                >
                  <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">
                        {bill.friendly_name || bill.description}
                      </p>
                      {bill.auto_detected && (
                        <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                          Auto
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(bill.next_due_date)}
                      {daysUntil >= 0 && (
                        <span className="ml-1">
                          ({daysUntil === 0 ? "today" : `in ${daysUntil}d`})
                        </span>
                      )}
                      {daysUntil < 0 && (
                        <span className="ml-1 text-rose-500">
                          (overdue)
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-medium">
                    {formatCurrency(bill.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
