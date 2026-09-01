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
