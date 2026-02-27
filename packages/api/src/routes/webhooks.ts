import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase";

const stripeEnabled = !!process.env.STRIPE_SECRET_KEY;
const stripe = stripeEnabled ? new Stripe(process.env.STRIPE_SECRET_KEY!) : null;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

const router = Router();

function priceToTier(priceId: string): "free" | "starter" | "pro" {
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  return "free";
}

router.post("/stripe", async (req: Request, res: Response) => {
  if (!stripeEnabled || !stripe) {
    return res.status(200).json({ received: true, message: "Webhooks disabled in test" });
  }

  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        if (!userId || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        const tier = priceToTier(subscription.items.data[0].price.id);

        await supabaseAdmin.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscription.id,
            tier,
            status: subscription.status,
            current_period_end: new Date(
              subscription.items.data[0].current_period_end * 1000
            ).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

        await supabaseAdmin
          .from("profiles")
          .update({ subscription_tier: tier })
          .eq("id", userId);
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (!sub) break;

        const tier =
          subscription.status === "active"
            ? priceToTier(subscription.items.data[0].price.id)
            : "free";

        await supabaseAdmin
          .from("subscriptions")
          .update({
            tier,
            status: subscription.status,
            current_period_end: new Date(
              subscription.items.data[0].current_period_end * 1000
            ).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        await supabaseAdmin
          .from("profiles")
          .update({ subscription_tier: tier })
          .eq("id", sub.user_id);
        break;
      }
    }
  } catch (err) {
    console.error("[webhook] Processing error:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }

  return res.status(200).json({ received: true });
});

export default router;
