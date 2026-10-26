import crypto from "node:crypto";
import { grantSubscriptionCredits, getSubscriptionByCustomer, getUserById, recordStripeEvent, upsertSubscription } from "./db";

const stripeBase = "https://api.stripe.com/v1";

function secret() {
  const value = process.env.STRIPE_SECRET_KEY;
  if (!value) throw new Error("Stripe is not configured");
  return value;
}

function stripeRequest(path: string, body: URLSearchParams) {
  return fetch(`${stripeBase}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function createCheckoutSession(input: { userId: number; email?: string | null; name?: string | null; origin: string }) {
  const origin = new URL(input.origin);
  if (!/^https?:$/.test(origin.protocol)) throw new Error("Invalid checkout origin");
  const body = new URLSearchParams({
    mode: "subscription",
    allow_promotion_codes: "true",
    customer_email: input.email ?? "",
    client_reference_id: String(input.userId),
    "metadata[user_id]": String(input.userId),
    "metadata[product]": "frameflow-pro",
    "subscription_data[metadata][user_id]": String(input.userId),
    "subscription_data[metadata][product]": "frameflow-pro",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": "1200",
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": "帧序 Pro",
    "line_items[0][price_data][product_data][description]": "短剧创作额度与版本能力",
    success_url: `${origin.origin}/?checkout=success`,
    cancel_url: `${origin.origin}/pricing?checkout=cancelled`,
  });
  if (!input.email) body.delete("customer_email");
  const response = await stripeRequest("/checkout/sessions", body);
  const data = await response.json() as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) throw new Error(data.error?.message || "Stripe Checkout session could not be created");
  return { id: data.id ?? "", url: data.url };
}

function verifySignature(rawBody: Buffer, header: string | undefined) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !header) return false;
  const parts = header.split(",").reduce<Record<string, string[]>>((acc, part) => {
    const [key, value] = part.split("=", 2);
    if (key && value) (acc[key] ??= []).push(value);
    return acc;
  }, {});
  const timestamp = parts.t?.[0];
  const signature = parts.v1?.[0];
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function asDate(seconds: unknown) {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
  if (!verifySignature(rawBody, signature)) return { accepted: false, status: 400 } as const;
  let event: { id: string; type: string; data?: { object?: Record<string, any> } };
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { accepted: false, status: 400 } as const;
  }
  const object = event.data?.object ?? {};
  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    const userId = Number(object.metadata?.user_id ?? 0);
    const existing = object.customer ? await getSubscriptionByCustomer(String(object.customer)) : null;
    const resolvedUserId = userId || existing?.userId;
    if (resolvedUserId) {
      const status = event.type.endsWith("deleted") ? "canceled" : String(object.status ?? "active");
      await upsertSubscription({
        userId: resolvedUserId,
        stripeCustomerId: object.customer ? String(object.customer) : existing?.stripeCustomerId,
        stripeSubscriptionId: object.id ? String(object.id) : existing?.stripeSubscriptionId,
        priceId: object.items?.data?.[0]?.price?.id ? String(object.items.data[0].price.id) : existing?.priceId,
        status,
        currentPeriodEnd: asDate(object.current_period_end),
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
      });
      if (status === "active" && object.id) {
        // Stripe's managed webhook subscription includes subscription updates
        // but not invoice.paid. The period end is therefore the durable cycle
        // key: unchanged updates are idempotent; a new period grants 600 once.
        const cycleKey = object.current_period_end ? String(object.current_period_end) : "initial";
        await grantSubscriptionCredits(resolvedUserId, String(object.id), cycleKey);
      }
    }
  }

  if (event.type === "checkout.session.completed") {
    const userId = Number(object.metadata?.user_id ?? object.client_reference_id ?? 0);
    const subscriptionId = object.subscription ? String(object.subscription) : null;
    if (userId && subscriptionId) {
      const user = await getUserById(userId);
      if (user) {
        await upsertSubscription({
          userId,
          stripeCustomerId: object.customer ? String(object.customer) : null,
          stripeSubscriptionId: subscriptionId,
          status: "active",
        });
      }
    }
  }
  // Record only after entitlement work succeeds. A 5xx from the route lets
  // Stripe retry a failed delivery instead of permanently swallowing it.
  await recordStripeEvent(event.id, event.type);
  return { accepted: true, status: 200 } as const;
}
