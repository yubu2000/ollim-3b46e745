// Server-only thin Stripe REST helper (no SDK, Worker-safe).
const API = "https://api.stripe.com/v1";

export function stripeKey() {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) {
    throw new Error(
      "Stripe가 아직 연결되지 않았습니다. 결제를 사용하려면 Stripe 비밀 키를 먼저 등록해 주세요.",
    );
  }
  return key;
}

function encode(obj: Record<string, string>) {
  return new URLSearchParams(obj).toString();
}

async function call<T>(path: string, body?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(body ? { body: encode(body) } : {}),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe 오류 (${res.status})`);
  return json;
}

export async function findOrCreateCustomer(email: string, userId: string) {
  const search = await call<{ data: { id: string }[] }>(
    `/customers?email=${encodeURIComponent(email)}&limit=1`,
  );
  const existing = search.data?.[0]?.id;
  if (existing) return existing;
  const created = await call<{ id: string }>("/customers", {
    email,
    "metadata[user_id]": userId,
  });
  return created.id;
}

export async function createCheckoutSession(params: {
  customerId: string;
  userId: string;
  plan: string;
  planLabel: string;
  amountKrw: number;
  interval: "monthly" | "yearly";
  origin: string;
}) {
  const session = await call<{ url: string }>("/checkout/sessions", {
    customer: params.customerId,
    mode: "subscription",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "krw",
    "line_items[0][price_data][unit_amount]": String(params.amountKrw),
    "line_items[0][price_data][recurring][interval]": params.interval === "yearly" ? "year" : "month",
    "line_items[0][price_data][product_data][name]": `올림연구소 ${params.planLabel} (${params.interval === "yearly" ? "연간" : "월간"})`,
    "metadata[user_id]": params.userId,
    "metadata[plan]": params.plan,
    "metadata[billing_interval]": params.interval,
    "subscription_data[metadata][user_id]": params.userId,
    "subscription_data[metadata][plan]": params.plan,
    "subscription_data[metadata][billing_interval]": params.interval,
    success_url: `${params.origin}/app/billing?checkout=success`,
    cancel_url: `${params.origin}/app/billing?checkout=cancel`,
  });
  return session.url;
}

export async function createPortalSession(customerId: string, origin: string) {
  const session = await call<{ url: string }>("/billing_portal/sessions", {
    customer: customerId,
    return_url: `${origin}/app/billing`,
  });
  return session.url;
}
