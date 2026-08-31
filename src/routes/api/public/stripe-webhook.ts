import { createFileRoute } from "@tanstack/react-router";

// Stripe signature verification (v1 scheme) using Web Crypto — Worker safe.
async function verify(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    }),
  ) as { t?: string; v1?: string };
  if (!parts.t || !parts.v1) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${payload}`));
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("not configured", { status: 503 });

        const body = await request.text();
        const ok = await verify(body, request.headers.get("stripe-signature"), secret);
        if (!ok) return new Response("invalid signature", { status: 401 });

        const event = JSON.parse(body) as {
          type: string;
          data: { object: Record<string, unknown> };
        };
        const obj = event.data.object;
        const metadata = (obj["metadata"] ?? {}) as Record<string, string>;
        const userId = metadata["user_id"];
        if (!userId) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (event.type === "checkout.session.completed" || event.type.startsWith("customer.subscription.")) {
          const cancelled =
            event.type === "customer.subscription.deleted" ||
            ["canceled", "unpaid", "incomplete_expired"].includes(String(obj["status"] ?? ""));
          const periodEnd = obj["current_period_end"];
          await supabaseAdmin.from("subscriptions").upsert(
            {
              user_id: userId,
              plan: cancelled ? "free" : (metadata["plan"] ?? "pro"),
              status: cancelled ? "canceled" : "active",
              stripe_customer_id: String(obj["customer"] ?? "") || null,
              stripe_subscription_id:
                event.type === "checkout.session.completed"
                  ? String(obj["subscription"] ?? "") || null
                  : String(obj["id"] ?? "") || null,
              current_period_end:
                typeof periodEnd === "number" ? new Date(periodEnd * 1000).toISOString() : null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
        }

        return new Response("ok");
      },
    },
  },
});
