import { useSearchParams, Link } from "react-router-dom";
import {
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSubscription, useBillingPortal } from "@/hooks/use-subscription";

function tierLabel(tier: string) {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function BillingPage() {
  const [searchParams] = useSearchParams();
  const success = searchParams.get("success") === "true";
  const { data: sub, isLoading, error, refetch } = useSubscription();
  const portal = useBillingPortal();

  const tier = sub?.tier ?? "free";
  const status = sub?.status ?? "active";
  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription and payment method
        </p>
      </div>

      {success && (
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
          <CardContent className="flex items-center gap-3 pt-6">
            <Sparkles className="size-5 text-green-600" />
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Subscription activated! Your new features are ready to use.
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <p className="text-sm text-destructive">
            Failed to load subscription details
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="size-4" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold">
                  {tierLabel(tier)}
                </span>
                <Badge
                  variant={status === "active" ? "secondary" : "destructive"}
                >
                  {status}
                </Badge>
              </div>

              {sub?.cancel_at_period_end && periodEnd && (
                <p className="text-sm text-yellow-600">
                  Cancels on {periodEnd}
                </p>
              )}

              {!sub?.cancel_at_period_end && periodEnd && (
                <p className="text-sm text-muted-foreground">
                  Next billing date: {periodEnd}
                </p>
              )}

              {tier === "free" ? (
                <Button asChild>
                  <Link to="/pricing">
                    Upgrade Plan
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => portal.mutate()}
                  disabled={portal.isPending}
                >
                  {portal.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      Manage Subscription
                      <ExternalLink className="size-3" />
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="ghost" className="justify-start" asChild>
                <Link to="/pricing">View Plans & Pricing</Link>
              </Button>
              {tier !== "free" && (
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => portal.mutate()}
                  disabled={portal.isPending}
                >
                  Update Payment Method
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
