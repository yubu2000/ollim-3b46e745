import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getLimits, getUsage } = await import("./billing.server");
    const [limits, usage] = await Promise.all([getLimits(context.userId), getUsage(context.userId)]);
    const plan = limits.plan;
    return {
      plan,
      usage,
      interval: limits.interval,
      limits: { audit: limits.audit, mention: limits.mention, ai: limits.ai },
      overridden: limits.overridden,
      exports: limits.exports,
      stripeReady: Boolean(process.env["STRIPE_SECRET_KEY"]),
    };
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        plan: z.enum(["pro", "business"]),
        interval: z.enum(["monthly", "yearly"]).default("monthly"),
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { PLANS, priceFor } = await import("./plans");
    const { findOrCreateCustomer, createCheckoutSession } = await import("./stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = (context.claims as { email?: string }).email;
    if (!email) throw new Error("계정 이메일을 확인할 수 없습니다.");

    const customerId = await findOrCreateCustomer(email, context.userId);
    await supabaseAdmin
      .from("subscriptions")
      .upsert(
        { user_id: context.userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );

    const spec = PLANS[data.plan];
    const url = await createCheckoutSession({
      customerId,
      userId: context.userId,
      plan: data.plan,
      planLabel: spec.label,
      amountKrw: priceFor(data.plan, data.interval),
      interval: data.interval,
      origin: data.origin,
    });
    return { url };
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ origin: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const { createPortalSession } = await import("./stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) throw new Error("결제 내역이 없습니다. 먼저 플랜을 구독해 주세요.");
    return { url: await createPortalSession(sub.stripe_customer_id, data.origin) };
  });

export const runCompetitorCompare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { fetchPage, runChecks, score } = await import("./geo-engine.server");
    const { computeSiteMetrics } = await import("./site-metrics.server");
    const { assertQuota, consume } = await import("./billing.server");
    const { supabase, userId } = context;

    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { data: competitors } = await supabase
      .from("competitor_sites")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true });

    const targets = [
      { id: null as string | null, label: `${project.brand_name} (내 사이트)`, url: project.site_url, self: true },
      ...(competitors ?? []).map((c) => ({ id: c.id, label: c.name, url: c.url, self: false })),
    ];

    await assertQuota(userId, "audit", targets.length);

    const rows = [];
    for (const target of targets) {
      try {
        const { url, html } = await fetchPage(target.url);
        const items = await runChecks(url, html);
        rows.push({
          user_id: userId,
          project_id: project.id,
          competitor_id: target.id,
          label: target.label,
          url,
          is_self: target.self,
          seo_score: score(items, "SEO"),
          geo_score: score(items, "GEO"),
          items: items as unknown as Record<string, unknown>[],
          metrics: computeSiteMetrics(url, html) as unknown as Record<string, unknown>,
          error: null as string | null,
        });
      } catch (error) {
        rows.push({
          user_id: userId,
          project_id: project.id,
          competitor_id: target.id,
          label: target.label,
          url: target.url,
          is_self: target.self,
          seo_score: 0,
          geo_score: 0,
          items: [],
          metrics: {},
          error: error instanceof Error ? error.message : "진단 실패",
        });
      }
    }

    const { error } = await supabase.from("competitor_audits").insert(rows as never);
    if (error) throw new Error(error.message);
    await consume(userId, "audit", targets.length);

    return { compared: rows.length };
  });

export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ auditId: z.string().uuid(), days: z.number().int().min(1).max(365) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertExportAllowed } = await import("./billing.server");
    await assertExportAllowed(context.userId);

    const { data: audit } = await context.supabase
      .from("audits")
      .select("id")
      .eq("id", data.auditId)
      .maybeSingle();
    if (!audit) throw new Error("리포트를 찾을 수 없습니다.");

    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "").slice(0, 40);
    const expires = new Date(Date.now() + data.days * 86400_000).toISOString();

    const { error } = await context.supabase.from("shared_reports").insert({
      user_id: context.userId,
      audit_id: data.auditId,
      token,
      expires_at: expires,
    });
    if (error) throw new Error(error.message);
    return { token, expiresAt: expires };
  });

export const revokeShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("shared_reports")
      .update({ revoked: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSharedReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(10).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: share } = await supabaseAdmin
      .from("shared_reports")
      .select("audit_id, revoked, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!share || share.revoked) return { ok: false as const, reason: "링크가 해제되었거나 존재하지 않습니다." };
    if (share.expires_at && new Date(share.expires_at) < new Date())
      return { ok: false as const, reason: "링크 유효기간이 지났습니다." };

    const [{ data: audit }, { data: items }] = await Promise.all([
      supabaseAdmin
        .from("audits")
        .select("target_url, seo_score, geo_score, summary, created_at, project_id")
        .eq("id", share.audit_id)
        .maybeSingle(),
      supabaseAdmin
        .from("audit_items")
        .select("category, title, passed, severity, evidence, recommendation")
        .eq("audit_id", share.audit_id),
    ]);
    if (!audit) return { ok: false as const, reason: "리포트를 찾을 수 없습니다." };

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("name")
      .eq("id", audit.project_id)
      .maybeSingle();

    return {
      ok: true as const,
      projectName: project?.name ?? "",
      audit: {
        target_url: audit.target_url,
        seo_score: audit.seo_score,
        geo_score: audit.geo_score,
        summary: audit.summary,
        created_at: audit.created_at,
      },
      items: items ?? [],
    };
  });
