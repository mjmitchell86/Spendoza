import { Check, X, Loader2 } from "lucide-react";
import { TIER_LIMITS, type SubscriptionTier } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/use-profile";
import { useCheckout } from "@/hooks/use-subscription";

const PLANS: {
  tier: SubscriptionTier;
  name: string;
  price: string;
  priceNote: string;
  envKey: string;
}[] = [
  {
    tier: "free",
    name: "Free",
    price: "$0",
    priceNote: "forever",
    envKey: "",
  },
  {
    tier: "starter",
    name: "Starter",
    price: "$1.99",
    priceNote: "/month",
    envKey: "VITE_STRIPE_STARTER_PRICE_ID",
  },
  {
    tier: "pro",
    name: "Pro",
    price: "$4.99",
    priceNote: "/month",
    envKey: "VITE_STRIPE_PRO_PRICE_ID",
  },
];

const FEATURES: { label: string; key: keyof (typeof TIER_LIMITS)["free"] }[] = [
  { label: "AI Categorization", key: "ai_categorization" },
  { label: "Weekly Email Reports", key: "email_reports" },
  { label: "Savings & Budget Goals", key: "goals" },
  { label: "Plaid Bank Linking", key: "plaid" },
  { label: "Household Features", key: "household" },
];

function StatementLimit(tier: SubscriptionTier) {
  const limit = TIER_LIMITS[tier].statements_per_month;
  return limit === Infinity ? "Unlimited" : `${limit}/month`;
}

export function PricingPage() {
  const { data: profile } = useProfile();
  const checkout = useCheckout();
  const currentTier = profile?.subscription_tier ?? "free";

  function handleSubscribe(plan: (typeof PLANS)[number]) {
    const priceId = import.meta.env[plan.envKey];
    if (!priceId) return;
    checkout.mutate(priceId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Choose the plan that fits your needs
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = currentTier === plan.tier;
          const limits = TIER_LIMITS[plan.tier];

          return (
            <Card
              key={plan.tier}
              className={
                plan.tier === "starter"
                  ? "border-primary shadow-md"
                  : undefined
              }
            >
              <CardHeader className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {plan.tier === "starter" && (
                    <Badge variant="secondary">Popular</Badge>
                  )}
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">
                    {plan.priceNote}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Check className="size-4 text-green-600" />
                    <span>
                      PDF Uploads: {StatementLimit(plan.tier)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="size-4 text-green-600" />
                    <span>Basic Dashboard</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="size-4 text-green-600" />
                    <span>Manual Categorization</span>
                  </div>

                  {FEATURES.map((feat) => {
                    const enabled = limits[feat.key];
                    return (
                      <div
                        key={feat.key}
                        className="flex items-center gap-2"
                      >
                        {enabled ? (
                          <Check className="size-4 text-green-600" />
                        ) : (
                          <X className="size-4 text-muted-foreground/40" />
                        )}
                        <span
                          className={
                            enabled ? "" : "text-muted-foreground/60"
                          }
                        >
                          {feat.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full">
                    Current Plan
                  </Button>
                ) : plan.tier === "free" ? (
                  <Button variant="outline" disabled className="w-full">
                    Free
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleSubscribe(plan)}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Subscribe"
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
