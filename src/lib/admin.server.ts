// Server-only master-admin helpers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLANS, planOf, type PlanId } from "./plans";
import { currentPeriod } from "./billing.server";

export async function isAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

export async function assertAdmin(userId: string) {
  if (!(await isAdmin(userId))) throw new Error("마스터 관리자만 사용할 수 있는 기능입니다.");
}

export type AdminUserRow = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  role: "admin" | "user";
  plan: PlanId;
  status: string | null;
  projects: number;
  usage: { audit: number; mention: number };
  limits: { audit: number; mention: number; exports: boolean };
  override: { audits: number | null; mentions: number | null; exports: boolean | null; note: string | null } | null;
};

export async function listUsers(): Promise<AdminUserRow[]> {
  const { data: authData, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message);

  const period = currentPeriod();
  const [roles, subs, usage, projects, overrides] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id, role"),
    supabaseAdmin.from("subscriptions").select("user_id, plan, status, current_period_end"),
    supabaseAdmin.from("usage_counters").select("user_id, kind, count").eq("period", period),
    supabaseAdmin.from("projects").select("user_id"),
    supabaseAdmin.from("plan_overrides").select("user_id, audits, mentions, exports, note"),
  ]);

  return authData.users.map((u) => {
    const role = (roles.data ?? []).some((r) => r.user_id === u.id && r.role === "admin") ? "admin" : "user";
    const sub = (subs.data ?? []).find((s) => s.user_id === u.id);
    const active = sub && (sub.status === "active" || sub.status === "trialing");
    const plan = active ? planOf(sub!.plan) : "free";
    const ov = (overrides.data ?? []).find((o) => o.user_id === u.id) ?? null;
    const used = (kind: string) =>
      (usage.data ?? []).find((r) => r.user_id === u.id && r.kind === kind)?.count ?? 0;

    return {
      id: u.id,
      email: u.email ?? "(이메일 없음)",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      role,
      plan,
      status: sub?.status ?? null,
      projects: (projects.data ?? []).filter((p) => p.user_id === u.id).length,
      usage: { audit: used("audit"), mention: used("mention") },
      limits: {
        audit: ov?.audits ?? PLANS[plan].audits,
        mention: ov?.mentions ?? PLANS[plan].mentions,
        exports: ov?.exports ?? PLANS[plan].exports,
      },
      override: ov
        ? { audits: ov.audits, mentions: ov.mentions, exports: ov.exports, note: ov.note }
        : null,
    };
  });
}

export async function listPayments() {
  const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const emails = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .order("updated_at", { ascending: false });

  const rows = (data ?? []).map((s) => ({
    id: s.id as string,
    userId: s.user_id as string,
    email: emails.get(s.user_id as string) ?? "",
    plan: planOf(s.plan as string | null),
    status: (s.status as string | null) ?? "none",
    customerId: (s.stripe_customer_id as string | null) ?? null,
    subscriptionId: (s.stripe_subscription_id as string | null) ?? null,
    currentPeriodEnd: (s.current_period_end as string | null) ?? null,
    updatedAt: s.updated_at as string,
  }));

  const mrr = rows
    .filter((r) => r.status === "active" || r.status === "trialing")
    .reduce((sum, r) => sum + PLANS[r.plan].price, 0);

  return {
    rows,
    summary: {
      mrr,
      paying: rows.filter((r) => (r.status === "active" || r.status === "trialing") && r.plan !== "free").length,
      total: rows.length,
    },
  };
}
