import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CategoryBreakdown } from "@/hooks/use-dashboard";

interface TopExpensesListProps {
  categories: CategoryBreakdown[];
}

const BAR_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-red-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-orange-500",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function TopExpensesList({ categories }: TopExpensesListProps) {
  const safe = Array.isArray(categories) ? categories : [];
  const sorted = [...safe].sort((a, b) => b.amount - a.amount);
  const maxAmount = sorted[0]?.amount ?? 1;

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Top Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            No expense data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle>Top Expenses</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {sorted.map((cat, index) => {
            const widthPercent = (cat.amount / maxAmount) * 100;
            return (
              <div key={cat.category} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{cat.category}</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(cat.amount)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-2 rounded-full transition-all",
                      BAR_COLORS[index % BAR_COLORS.length]
                    )}
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
