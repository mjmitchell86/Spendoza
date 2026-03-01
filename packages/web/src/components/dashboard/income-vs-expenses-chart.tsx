import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSummary } from "@/hooks/use-dashboard";

interface IncomeVsExpensesChartProps {
  summary: DashboardSummary;
}

const COLORS = {
  income: "#10b981",
  expenses: "#f43f5e",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number) {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return formatCurrency(value);
}

export function IncomeVsExpensesChart({ summary }: IncomeVsExpensesChartProps) {
  const data = [
    { name: "Income", value: summary.total_income, fill: COLORS.income },
    { name: "Expenses", value: summary.total_expenses, fill: COLORS.expenses },
  ];

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle>Income vs Expenses</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 24, right: 8, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fontSize: 13 }}
                className="fill-muted-foreground"
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatCompact(v)}
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                width={60}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), ""]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                  fontSize: "13px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
              />
              <defs>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={1} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={80}>
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={
                      entry.name === "Income"
                        ? "url(#incomeGradient)"
                        : "url(#expenseGradient)"
                    }
                  />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: number) => formatCurrency(v)}
                  className="fill-foreground text-xs font-medium"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
