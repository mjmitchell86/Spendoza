import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { allocationScale } from "@spendoza/shared";

interface AllocationBarProps {
  allocation: {
    needs: { amount: number; percentage: number };
    wants: { amount: number; percentage: number };
    savings: { amount: number; percentage: number };
    unclassified: { amount: number; percentage: number };
  };
}

const SEGMENTS = [
  { key: "needs", label: "Needs", color: "#3b82f6" },
  { key: "wants", label: "Wants", color: "#8b5cf6" },
  { key: "savings", label: "Savings", color: "#10b981" },
  { key: "unclassified", label: "Unclassified", color: "#6b7280" },
] as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function AllocationBar({ allocation }: AllocationBarProps) {
  const segments = SEGMENTS.map((seg) => ({
    ...seg,
    ...allocation[seg.key],
  })).filter((seg) => seg.percentage > 0);
  // Shares of income can add up past 100% when spending beat income; the bar then shrinks to fit.
  const scale = allocationScale(segments.map((seg) => seg.percentage));

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Share of income
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stacked bar with benchmark markers */}
        <div className="relative">
          {/* Benchmark labels */}
          <div className="mb-1 flex text-[10px] text-muted-foreground">
            <span style={{ width: `${scale.marks[0]}%` }} className="text-right pr-1">
              50%
            </span>
            <span style={{ width: `${scale.marks[1] - scale.marks[0]}%` }} className="text-right pr-1">
              80%
            </span>
          </div>

          <div className="flex h-8 w-full overflow-hidden rounded-lg">
            {segments.map((seg, i) => (
              <div
                key={seg.key}
                className="h-full cursor-default transition-all hover:opacity-80"
                title={`${seg.label}: ${formatCurrency(seg.amount)} (${seg.percentage.toFixed(0)}%)`}
                style={{
                  width: `${scale.widths[i]}%`,
                  backgroundColor: seg.color,
                }}
              />
            ))}
          </div>

          {/* Benchmark dashed lines */}
          <div
            className="absolute top-5 h-8 w-px border-l border-dashed border-foreground/30"
            style={{ left: `${scale.marks[0]}%` }}
          />
          <div
            className="absolute top-5 h-8 w-px border-l border-dashed border-foreground/30"
            style={{ left: `${scale.marks[1]}%` }}
          />
        </div>

        {/* Labels */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((seg) => (
            <div key={seg.key} className="flex items-center gap-1.5 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-muted-foreground">{seg.label}</span>
              <span className="font-medium">{seg.percentage.toFixed(0)}%</span>
            </div>
          ))}
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground">
          {scale.overIncome
            ? "More went out than came in, so the bar is shrunk to fit. Dashed markers show 50/30/20 rule boundaries."
            : "Dashed markers show 50/30/20 rule boundaries"}
        </p>
      </CardContent>
    </Card>
  );
}
