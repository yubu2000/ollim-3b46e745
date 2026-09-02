import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** 프로젝트 카드 클릭 시 보여줄 요약: 진단 기록 · 사용량 · AI 크레딧 내역. */
export const getProjectOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getLimits, getUsage, currentPeriod } = await import("./billing.server");

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const period = currentPeriod();
    const monthStart = `${period}-01T00:00:00.000Z`;

    const [limits, usage, audits, auditsMonth, mentions, mentionsMonth, aiEvents, aiMonth, articles] =
      await Promise.all([
        getLimits(userId),
        getUsage(userId),
        supabase
          .from("audits")
          .select("id, target_url, seo_score, geo_score, summary, created_at")
          .eq("project_id", project.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("audits")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
          .gte("created_at", monthStart),
        supabase
          .from("mention_runs")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id),
        supabase
          .from("mention_runs")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
          .gte("created_at", monthStart),
        supabase
          .from("ai_usage_events")
          .select("id, action, credits, detail, created_at")
          .eq("project_id", project.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("ai_usage_events")
          .select("credits")
          .eq("project_id", project.id)
          .gte("created_at", monthStart),
        supabase
          .from("generated_articles")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id),
      ]);

    const aiCreditsThisMonth = (aiMonth.data ?? []).reduce((sum, r) => sum + (r.credits ?? 0), 0);

    return {
      project: {
        id: project.id,
        name: project.name,
        site_url: project.site_url,
        brand_name: project.brand_name,
        created_at: project.created_at,
      },
      period,
      limits,
      usage,
      counts: {
        auditsTotal: audits.data?.length ?? 0,
        auditsThisMonth: auditsMonth.count ?? 0,
        mentionsTotal: mentions.count ?? 0,
        mentionsThisMonth: mentionsMonth.count ?? 0,
        articlesTotal: articles.count ?? 0,
        aiCreditsThisMonth,
      },
      audits: audits.data ?? [],
      aiEvents: aiEvents.data ?? [],
    };
  });

/** 대시보드용: 프로젝트별 진단/멘션/AI 크레딧 요약 + 계정 남은 한도. */
export const getProjectsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { getLimits, getUsage, currentPeriod } = await import("./billing.server");
    const period = currentPeriod();
    const monthStart = `${period}-01T00:00:00.000Z`;

    const [limits, usage, projects, audits, mentions, ai] = await Promise.all([
      getLimits(userId),
      getUsage(userId),
      supabase.from("projects").select("id, name, site_url").order("created_at"),
      supabase.from("audits").select("project_id, created_at").eq("user_id", userId),
      supabase.from("mention_runs").select("project_id, created_at").eq("user_id", userId),
      supabase.from("ai_usage_events").select("project_id, credits, created_at").eq("user_id", userId),
    ]);

    const byProject = (projects.data ?? []).map((p) => {
      const a = (audits.data ?? []).filter((r) => r.project_id === p.id);
      const m = (mentions.data ?? []).filter((r) => r.project_id === p.id);
      const c = (ai.data ?? []).filter((r) => r.project_id === p.id);
      const inMonth = (v: { created_at: string }) => v.created_at >= monthStart;
      return {
        id: p.id,
        name: p.name,
        siteUrl: p.site_url,
        auditsTotal: a.length,
        auditsThisMonth: a.filter(inMonth).length,
        mentionsThisMonth: m.filter(inMonth).length,
        aiCreditsThisMonth: c.filter(inMonth).reduce((s, r) => s + (r.credits ?? 0), 0),
      };
    });

    return { period, limits, usage, projects: byProject };
  });

/**
 * Organization JSON-LD + canonical 태그를 프로젝트 도메인 기준으로 생성하고,
 * 실제 사이트에 반영됐는지 라이브로 확인합니다.
 */
export const getTrustTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), verify: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project } = await supabase
      .from("projects")
      .select("id, name, brand_name, site_url")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const origin = new URL(
      /^https?:\/\//i.test(project.site_url) ? project.site_url : `https://${project.site_url}`,
    ).origin;
    const canonicalUrl = `${origin}/`;
    const brand = project.brand_name || project.name;

    const organization = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: brand,
      url: canonicalUrl,
      logo: `${origin}/favicon.ico`,
      sameAs: [] as string[],
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          areaServed: "KR",
          availableLanguage: ["ko"],
        },
      ],
    };

    const jsonld = `<script type="application/ld+json">\n${JSON.stringify(organization, null, 2)}\n</script>`;
    const canonicalTag = `<link rel="canonical" href="${canonicalUrl}" />`;
    const snippet = `${canonicalTag}\n${jsonld}`;

    if (!data.verify) {
      return { origin, canonicalUrl, brand, snippet, canonicalTag, jsonld, live: null };
    }

    const { verifyPublishedPage } = await import("./publish-verify.server");
    const result = await verifyPublishedPage(canonicalUrl);
    const hasOrganization = result.jsonldTypes.some((t) =>
      /Organization|LocalBusiness|Corporation/i.test(t),
    );

    return {
      origin,
      canonicalUrl,
      brand,
      snippet,
      canonicalTag,
      jsonld,
      live: {
        reachable: result.reachable,
        status: result.status,
        finalUrl: result.finalUrl,
        canonical: result.canonical,
        canonicalOk: Boolean(result.canonical),
        jsonldTypes: result.jsonldTypes,
        organizationOk: hasOrganization,
      },
    };
  });

/** 프로젝트와 관련 데이터(진단·멘션·콘텐츠·알림 등)를 모두 삭제합니다. */
export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const projectId = data.projectId;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: audits } = await supabase
      .from("audits")
      .select("id")
      .eq("project_id", projectId);
    const auditIds = (audits ?? []).map((a) => a.id);

    if (auditIds.length > 0) {
      await supabaseAdmin.from("shared_reports").delete().in("audit_id", auditIds);
      await supabaseAdmin.from("audit_items").delete().in("audit_id", auditIds);
    }

    const childTables = [
      "ai_usage_events",
      "alert_events",
      "alert_rules",
      "competitor_audits",
      "competitor_sites",
      "generated_articles",
      "mention_runs",
      "prompts",
      "publish_verifications",
      "search_console_snapshots",
    ] as const;
    for (const table of childTables) {
      await supabaseAdmin.from(table).delete().eq("project_id", projectId);
    }

    await supabaseAdmin.from("audits").delete().eq("project_id", projectId);

    const { error } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    return { deleted: true, name: project.name };
  });

/** 사이트 주소를 비교용 도메인으로 정규화합니다 (소문자, www 제거). */
function normalizeHost(raw: string) {
  const value = raw.trim();
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

/**
 * 프로젝트 생성.
 * - Free 플랜은 프로젝트 1개까지만 등록 가능
 * - 동일 도메인을 여러 계정으로 중복 등록해 무료 한도를 우회하는 것을 차단
 */
export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1),
        siteUrl: z.string().trim().min(3),
        brandName: z.string().trim().min(1),
        competitors: z.array(z.string().trim().min(1)).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { getLimits } = await import("./billing.server");
    const { PROJECT_LIMIT } = await import("./plans");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const host = normalizeHost(data.siteUrl);
    if (!host || !host.includes(".")) throw new Error("사이트 주소를 정확히 입력해 주세요.");

    const limits = await getLimits(userId);
    const plan = limits.plan;
    const projectLimit = PROJECT_LIMIT[plan];

    const { data: mine, error: mineError } = await supabaseAdmin
      .from("projects")
      .select("id, site_url")
      .eq("user_id", userId);
    if (mineError) throw new Error(mineError.message);

    if ((mine ?? []).length >= projectLimit) {
      throw new Error(
        plan === "free"
          ? "무료 플랜은 프로젝트를 1개만 등록할 수 있습니다. 플랜을 업그레이드하면 더 많은 사이트를 모니터링할 수 있어요."
          : `현재 플랜에서 등록할 수 있는 프로젝트 수(${projectLimit}개)를 모두 사용했습니다.`,
      );
    }

    if ((mine ?? []).some((p) => normalizeHost(p.site_url) === host)) {
      throw new Error("이미 같은 사이트로 등록된 프로젝트가 있습니다.");
    }

    // 다른 계정이 같은 도메인을 이미 등록했는지 확인 (무료 계정 다중 생성 우회 차단)
    const { data: others, error: othersError } = await supabaseAdmin
      .from("projects")
      .select("id, user_id, site_url")
      .neq("user_id", userId)
      .ilike("site_url", `%${host}%`);
    if (othersError) throw new Error(othersError.message);

    const claimed = (others ?? []).some((p) => normalizeHost(p.site_url) === host);
    if (claimed) {
      throw new Error(
        "이 사이트는 이미 다른 계정에 등록되어 있습니다. 동일한 사이트는 하나의 계정에서만 진단할 수 있습니다.",
      );
    }

    const { data: created, error } = await supabaseAdmin
      .from("projects")
      .insert({
        user_id: userId,
        name: data.name,
        site_url: data.siteUrl,
        brand_name: data.brandName,
        competitors: data.competitors,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { id: created.id, plan, projectLimit };
  });
