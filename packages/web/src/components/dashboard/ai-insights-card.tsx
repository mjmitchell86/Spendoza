import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AiInsightsCardProps {
  insights: string | null;
  /** YYYY-MM-01 string indicating which month the insights are from */
  insightsMonth?: string;
}

function parseInsights(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^[\s]*[•\-*]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

function formatMonth(monthStr: string): string {
  const d = new Date(monthStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function AiInsightsCard({ insights, insightsMonth }: AiInsightsCardProps) {
  const items = insights ? parseInsights(insights) : [];

  if (items.length === 0) {
    return (
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 text-primary" />
            Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-sm text-muted-foreground">
            No insights available yet. Generate a report to get personalized
            financial insights.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="size-4 text-primary drop-shadow-[0_0_6px_hsl(var(--primary))]" />
          Insights
        </CardTitle>
        {insightsMonth && (
          <p className="text-xs text-muted-foreground">
            Latest available — {formatMonth(insightsMonth)}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li
              key={index}
              className="rounded-md border-l-2 border-l-primary/30 bg-primary/5 px-3 py-2 text-sm leading-relaxed"
            >
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
