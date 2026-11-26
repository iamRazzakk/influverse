import Stripe from "stripe";
import config from ".";

let client: Stripe | null = null;

/** Lazy — server still starts in dev without STRIPE_SECRET_KEY; errors only when Stripe is used. */
export const getStripe = (): Stripe => {
  if (!config.stripe.secretKey) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY)");
  }
  if (!client) {
    client = new Stripe(config.stripe.secretKey, {
      apiVersion: "2024-06-20",
      maxNetworkRetries: 2,
      appInfo: { name: "influverse-server" },
    });
  }
  return client;
};
