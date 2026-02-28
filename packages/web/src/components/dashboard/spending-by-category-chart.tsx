import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryBreakdown } from "@/hooks/use-dashboard";

interface SpendingByCategoryChartProps {
  categories: CategoryBreakdown[];
}

const CATEGORY_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#a855f7", // purple
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function SpendingByCategoryChart({
  categories,
}: SpendingByCategoryChartProps) {
  if (!Array.isArray(categories) || categories.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Spending by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[260px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No category data available
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle>Spending by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categories}
                dataKey="amount"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={75}
                innerRadius={35}
                paddingAngle={2}
                label={false}
              >
                {categories.map((_entry, index) => (
                  <Cell
                    key={index}
                    fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name,
                ]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                  fontSize: "13px",
                }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
