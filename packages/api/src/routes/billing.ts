import { Router, type Response } from "express";
import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";

const stripeEnabled = !!process.env.STRIPE_SECRET_KEY;
const stripe = stripeEnabled ? new Stripe(process.env.STRIPE_SECRET_KEY!) : null;
const router = Router();

// In non-production, all users are treated as pro — no Stripe calls
if (!stripeEnabled) {
  router.post("/checkout", (_req, res: Response) => {
    return res.status(200).json({ message: "Stripe disabled in test — all users have pro access" });
  });

  router.post("/portal", (_req, res: Response) => {
    return res.status(200).json({ message: "Stripe disabled in test — all users have pro access" });
  });

  router.get("/subscription", (req, res: Response) => {
    return res.status(200).json({ tier: "pro", status: "active" });
  });
} else {
  // POST /checkout — create Stripe Checkout session
  router.post("/checkout", async (req, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const { price_id } = req.body;

    if (!price_id) {
      return res.status(400).json({ error: "price_id is required" });
    }

    // Get or create Stripe customer
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe!.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      await supabaseAdmin.from("subscriptions").upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          tier: "free",
          status: "active",
        },
        { onConflict: "user_id" }
      );
    }

    const session = await stripe!.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      metadata: { user_id: user.id },
    });

    return res.status(200).json({ url: session.url });
  });

  // POST /portal — create Stripe Customer Portal session
  router.post("/portal", async (req, res: Response) => {
    const { user } = req as AuthenticatedRequest;

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (!sub?.stripe_customer_id) {
      return res.status(404).json({ error: "No billing account found" });
    }

    const session = await stripe!.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/billing`,
    });

    return res.status(200).json({ url: session.url });
  });

  // GET /subscription — get current subscription details
  router.get("/subscription", async (req, res: Response) => {
    const { user } = req as AuthenticatedRequest;

    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .single();

    return res.status(200).json(data ?? { tier: "free", status: "active" });
  });
}

export default router;
