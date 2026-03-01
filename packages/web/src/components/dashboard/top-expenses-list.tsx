import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryBreakdown } from "@/hooks/use-dashboard";

interface TopExpensesListProps {
  categories: CategoryBreakdown[];
}

const BAR_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
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
  const total = sorted.reduce((sum, c) => sum + c.amount, 0);

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
            const pct = total > 0 ? ((cat.amount / total) * 100).toFixed(0) : "0";
            const color = BAR_COLORS[index % BAR_COLORS.length];
            return (
              <div key={cat.category} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{cat.category}</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(cat.amount)}{" "}
                    <span className="text-xs">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted">
                  <div
                    className="h-2.5 rounded-full transition-all"
                    style={{
                      width: `${widthPercent}%`,
                      background: `linear-gradient(90deg, ${color}, ${color}99)`,
                    }}
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
