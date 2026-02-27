import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface UpgradePromptProps {
  feature: string;
  requiredTier: string;
}

export function UpgradePrompt({ feature, requiredTier }: UpgradePromptProps) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center sm:flex-row sm:text-left">
        <Sparkles className="size-8 shrink-0 text-primary/60" />
        <div className="flex-1">
          <p className="font-medium">
            {feature} requires the {requiredTier} plan
          </p>
          <p className="text-sm text-muted-foreground">
            Upgrade to unlock this feature and more.
          </p>
        </div>
        <Button asChild>
          <Link to="/pricing">View Plans</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
