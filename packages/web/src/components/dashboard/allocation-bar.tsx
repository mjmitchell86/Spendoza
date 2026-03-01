import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  { key: "unclassified", label: "Unclassified", color: "#9ca3af" },
] as const;

export function AllocationBar({ allocation }: AllocationBarProps) {
  const segments = SEGMENTS.map((seg) => ({
    ...seg,
    ...allocation[seg.key],
  })).filter((seg) => seg.percentage > 0);

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Spending Allocation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stacked bar */}
        <div className="relative">
          <div className="flex h-6 w-full overflow-hidden rounded-full">
            {segments.map((seg) => (
              <div
                key={seg.key}
                className="h-full transition-all"
                style={{
                  width: `${seg.percentage}%`,
                  backgroundColor: seg.color,
                }}
              />
            ))}
          </div>

          {/* Benchmark markers at 50% and 80% (50/30/20 rule boundaries) */}
          <div
            className="absolute top-0 h-6 w-px bg-white/80"
            style={{ left: "50%" }}
            title="50% benchmark"
          />
          <div
            className="absolute top-0 h-6 w-px bg-white/80"
            style={{ left: "80%" }}
            title="80% benchmark"
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

        {/* Benchmark legend */}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Markers show 50/30/20 rule boundaries
        </p>
      </CardContent>
    </Card>
  );
}
