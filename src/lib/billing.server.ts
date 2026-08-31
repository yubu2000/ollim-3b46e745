// Server-only plan / usage enforcement.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLANS, planOf, type PlanId } from "./plans";

export type UsageKind = "audit" | "mention";

export function currentPeriod() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export async function getPlan(userId: string): Promise<PlanId> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return "free";
  if (data.status !== "active" && data.status !== "trialing") return "free";
  return planOf(data.plan);
}

export async function getUsage(userId: string) {
  const { data } = await supabaseAdmin
    .from("usage_counters")
    .select("kind, count")
    .eq("user_id", userId)
    .eq("period", currentPeriod());
  const rows = data ?? [];
  const of = (kind: UsageKind) => rows.find((r) => r.kind === kind)?.count ?? 0;
  return { audit: of("audit"), mention: of("mention") };
}

async function getOverride(userId: string) {
  const { data } = await supabaseAdmin
    .from("plan_overrides")
    .select("audits, mentions, exports")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** Effective limits = plan defaults, widened by any admin override. */
export async function getLimits(userId: string) {
  const [plan, override] = await Promise.all([getPlan(userId), getOverride(userId)]);
  return {
    plan,
    audit: override?.audits ?? PLANS[plan].audits,
    mention: override?.mentions ?? PLANS[plan].mentions,
    exports: override?.exports ?? PLANS[plan].exports,
    overridden: Boolean(override),
  };
}

/** Throws when the monthly quota would be exceeded. `amount` = units about to be consumed. */
export async function assertQuota(userId: string, kind: UsageKind, amount = 1) {
  const [limits, usage] = await Promise.all([getLimits(userId), getUsage(userId)]);
  const plan = limits.plan;
  const limit = kind === "audit" ? limits.audit : limits.mention;
  const used = usage[kind];
  if (used + amount > limit) {
    const name = kind === "audit" ? "진단" : "멘션 체크";
    throw new Error(
      `이번 달 ${name} 한도(${limit}회)를 모두 사용했습니다. 요금제 페이지에서 플랜을 업그레이드해 주세요.`,
    );
  }
  return { plan, used, limit };
}

export async function consume(userId: string, kind: UsageKind, amount = 1) {
  const period = currentPeriod();
  const { data } = await supabaseAdmin
    .from("usage_counters")
    .select("id, count")
    .eq("user_id", userId)
    .eq("period", period)
    .eq("kind", kind)
    .maybeSingle();

  if (data) {
    await supabaseAdmin
      .from("usage_counters")
      .update({ count: data.count + amount, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    return;
  }
  await supabaseAdmin.from("usage_counters").insert({ user_id: userId, period, kind, count: amount });
}

export async function assertExportAllowed(userId: string) {
  const limits = await getLimits(userId);
  const plan = limits.plan;
  if (!limits.exports) {
    throw new Error("PDF 내보내기와 공유 링크는 Pro 플랜부터 사용할 수 있습니다.");
  }
  return plan;
}
