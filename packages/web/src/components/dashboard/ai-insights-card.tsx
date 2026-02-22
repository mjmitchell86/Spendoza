import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AiInsightsCardProps {
  insights: string;
}

function parseInsights(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^[\s]*[•\-\*]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

export function AiInsightsCard({ insights }: AiInsightsCardProps) {
  const items = parseInsights(insights);

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4" />
            AI Insights
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
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="size-4" />
          AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-1 block size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
