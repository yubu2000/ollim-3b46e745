import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Verified Search Console properties that cover the project's site. */
export const listGscProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { gscConfigured, matchingSites } = await import("./gsc.server");
    if (!gscConfigured()) return { configured: false, matches: [], all: [] };

    const { data: project } = await context.supabase
      .from("projects")
      .select("site_url")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { matches, all } = await matchingSites(project.site_url);
    return { configured: true, matches, all };
  });

export const saveGscProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), siteUrl: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ gsc_site_url: data.siteUrl })
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Pull the latest 28 complete days from Search Console and store the snapshot. */
export const refreshGscSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { refreshProjectSnapshot } = await import("./gsc.server");
    const { data: project } = await context.supabase
      .from("projects")
      .select("id, user_id, gsc_site_url")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
    return await refreshProjectSnapshot(context.supabase as never, project);
  });

/** Keyword + content suggestions for a report; cached on the audit row. */
export const getKeywordSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ auditId: z.string().uuid(), refresh: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { buildKeywordSuggestions } = await import("./keyword-suggest.server");
    type Suggestions = Awaited<ReturnType<typeof buildKeywordSuggestions>>;
    const { supabase, userId } = context;

    const { data: audit, error } = await supabase
      .from("audits")
      .select("id, project_id, target_url, keyword_suggestions")
      .eq("id", data.auditId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!audit) throw new Error("진단을 찾을 수 없습니다.");

    if (!data.refresh && audit.keyword_suggestions) {
      return audit.keyword_suggestions as unknown as Suggestions;
    }

    const { data: project } = await supabase
      .from("projects")
      .select("brand_name")
      .eq("id", audit.project_id)
      .maybeSingle();

    const { data: snapshot } = await supabase
      .from("search_console_snapshots")
      .select("top_queries")
      .eq("project_id", audit.project_id)
      .maybeSingle();

    const suggestions = await buildKeywordSuggestions({
      url: audit.target_url,
      brand: project?.brand_name ?? "",
      gscQueries: (snapshot?.top_queries ?? []) as never,
    });

    await supabase
      .from("audits")
      .update({ keyword_suggestions: suggestions as never })
      .eq("id", audit.id)
      .eq("user_id", userId);

    return suggestions;
  });

/** Turn a recommended title + outline into a full article draft. */
export const generateArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        auditId: z.string().uuid(),
        title: z.string().min(2),
        targetKeyword: z.string().default(""),
        format: z.string().default("가이드"),
        outline: z.array(z.string()).default([]),
        length: z.enum(["short", "medium", "long"]).default("medium"),
        tone: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { draftArticle } = await import("./article.server");
    const { assertQuota, consume } = await import("./billing.server");
    const { AI_COST } = await import("./plans");
    const { supabase, userId } = context;
    await assertQuota(userId, "ai", AI_COST.article);

    const { data: audit } = await supabase
      .from("audits")
      .select("id, project_id, keyword_suggestions")
      .eq("id", data.auditId)
      .maybeSingle();
    if (!audit) throw new Error("진단을 찾을 수 없습니다.");

    const { data: project } = await supabase
      .from("projects")
      .select("id, brand_name, site_url")
      .eq("id", audit.project_id)
      .maybeSingle();
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const suggestions = (audit.keyword_suggestions ?? {}) as {
      keywords?: { keyword: string }[];
    };
    const supporting = (suggestions.keywords ?? [])
      .map((k) => k.keyword)
      .filter((k) => k && k !== data.targetKeyword)
      .slice(0, 6);

    const draft = await draftArticle({
      title: data.title,
      targetKeyword: data.targetKeyword,
      format: data.format,
      outline: data.outline,
      brand: project.brand_name ?? "",
      siteUrl: project.site_url,
      supportingKeywords: supporting,
      length: data.length,
      ...(data.tone ? { tone: data.tone } : {}),
    });

    const { data: saved, error } = await supabase
      .from("generated_articles")
      .insert({
        user_id: userId,
        project_id: project.id,
        audit_id: audit.id,
        title: draft.title,
        target_keyword: draft.targetKeyword,
        format: draft.format,
        outline: draft.outline as never,
        markdown: draft.markdown,
        meta_title: draft.metaTitle,
        meta_description: draft.metaDescription,
        faq: draft.faq as never,
        jsonld: draft.jsonld as never,
        word_count: draft.wordCount,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await consume(userId, "ai", AI_COST.article);
    const { logAiUsage } = await import("./billing.server");
    await logAiUsage(userId, "article", AI_COST.article, { projectId: project.id, detail: draft.title });

    return { ...draft, id: saved.id, jsonld: JSON.stringify(draft.jsonld, null, 2) };
  });

/** Previously generated drafts for a project. */
export const listArticles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("generated_articles")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("generated_articles")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Render a draft as standalone HTML for manual pasting into a CMS. */
export const renderArticleHtml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(1),
        markdown: z.string().default(""),
        faq: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
        jsonld: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { articleToHtml } = await import("./wordpress.server");
    let ld: unknown = undefined;
    if (data.jsonld) {
      try {
        ld = JSON.parse(data.jsonld);
      } catch {
        ld = undefined;
      }
    }
    return {
      html: articleToHtml({
        title: data.title,
        markdown: data.markdown,
        faq: data.faq,
        ...(ld ? { jsonld: ld } : {}),
      }),
    };
  });

/** The member's own WordPress connection (application password is never returned). */
export const getWordPressSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("wordpress_sites")
      .select("site_url, username, default_status, last_checked_at, last_check_ok")
      .maybeSingle();
    return data ?? null;
  });

export const saveWordPressSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        siteUrl: z.string().min(4),
        username: z.string().min(1),
        appPassword: z.string().min(6),
        defaultStatus: z.enum(["draft", "publish"]).default("draft"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { testUserSite } = await import("./wordpress.server");
    const site = {
      site_url: data.siteUrl,
      username: data.username,
      app_password: data.appPassword,
    };
    const check = await testUserSite(site);

    const { error } = await context.supabase.from("wordpress_sites").upsert(
      {
        user_id: context.userId,
        ...site,
        default_status: data.defaultStatus,
        last_checked_at: new Date().toISOString(),
        last_check_ok: true,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, name: check.name };
  });

export const deleteWordPressSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("wordpress_sites")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** Generate an illustration for a draft; returned as a data URL for preview + upload. */
export const createArticleImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ prompt: z.string().min(2) }).parse(input))
  .handler(async ({ data, context }) => {
    const { generateArticleImage } = await import("./image.server");
    const { withAiCredits } = await import("./billing.server");
    const { AI_COST } = await import("./plans");
    return await withAiCredits(context.userId, AI_COST.image, () => generateArticleImage(data.prompt), {
      action: "image",
      detail: data.prompt.slice(0, 120),
    });
  });

/** Publish a generated draft to the member's own WordPress blog (falls back to the shared connector). */
export const publishArticleToWordPress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(1),
        markdown: z.string().default(""),
        metaDescription: z.string().default(""),
        faq: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
        jsonld: z.string().optional(),
        status: z.enum(["draft", "publish"]).default("draft"),
        images: z
          .array(
            z.object({
              dataUrl: z.string().optional(),
              url: z.string().optional(),
              alt: z.string().optional(),
              filename: z.string().optional(),
            }),
          )
          .default([]),

      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      articleToHtml,
      publishPost,
      publishToUserSite,
      uploadMediaToUserSite,
    } = await import("./wordpress.server");

    let ld: unknown = undefined;
    if (data.jsonld) {
      try {
        ld = JSON.parse(data.jsonld);
      } catch {
        ld = undefined;
      }
    }

    const { data: siteRow } = await (context.supabase as never as ReturnType<typeof Object>)
      .from("wordpress_sites")
      .select("site_url, username, app_password")
      .maybeSingle();

    // 회원 본인의 WordPress가 등록돼 있으면 그쪽으로 게시한다.
    if (siteRow) {
      const site = siteRow as { site_url: string; username: string; app_password: string };
      const uploaded: { url: string; alt: string; id: number }[] = [];
      for (const [i, img] of data.images.entries()) {
        uploaded.push(
          await uploadMediaToUserSite(site, {
            ...(img.dataUrl ? { dataUrl: img.dataUrl } : {}),
            ...(img.url ? { url: img.url } : {}),
            alt: img.alt ?? data.title,
            filename: img.filename ?? `${Date.now()}-${i + 1}`,
          }),
        );
      }
      const contentHtml = articleToHtml({
        title: data.title,
        markdown: data.markdown,
        faq: data.faq,
        images: uploaded.map((u) => ({ url: u.url, alt: u.alt })),
        ...(ld ? { jsonld: ld } : {}),
      });
      const post = await publishToUserSite(site, {
        title: data.title,
        contentHtml,
        excerpt: data.metaDescription,
        status: data.status,
        ...(uploaded[0] ? { featuredMediaId: uploaded[0].id } : {}),
      });
      return { ...post, target: site.site_url, images: uploaded.length };
    }

    const contentHtml = articleToHtml({
      title: data.title,
      markdown: data.markdown,
      faq: data.faq,
      images: data.images
        .filter((i) => i.url)
        .map((i) => ({ url: i.url!, alt: i.alt ?? data.title })),
      ...(ld ? { jsonld: ld } : {}),
    });
    const post = await publishPost({
      title: data.title,
      contentHtml,
      excerpt: data.metaDescription,
      status: data.status,
    });
    return { ...post, target: "관리자 WordPress", images: 0 };
  });

/** Fetch a published URL, check canonical + JSON-LD, and record the result on the report. */
export const verifyPublishedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        url: z.string().min(4),
        expectTitle: z.string().optional(),
        auditId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { verifyPublishedPage } = await import("./publish-verify.server");
    const result = await verifyPublishedPage(
      data.url,
      data.expectTitle ? { expectTitle: data.expectTitle } : {},
    );

    if (data.auditId) {
      const { data: audit } = await context.supabase
        .from("audits")
        .select("id, project_id")
        .eq("id", data.auditId)
        .maybeSingle();
      if (audit) {
        await (context.supabase as never as ReturnType<typeof Object>)
          .from("publish_verifications")
          .insert({
            user_id: context.userId,
            audit_id: audit.id,
            project_id: audit.project_id,
            url: result.url,
            final_url: result.finalUrl,
            status: result.status,
            reachable: result.reachable,
            has_canonical: Boolean(result.canonical),
            has_jsonld: result.jsonldTypes.length > 0,
            canonical: result.canonical,
            jsonld_types: result.jsonldTypes,
            passed_count: result.checks.filter((c) => c.passed).length,
            total_count: result.checks.length,
            checks: result.checks,
          });
      }
    }

    return result;
  });


/** Auto-generate FAQ/Article/Organization JSON-LD from a page and validate it. */
export const generateSchemas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ auditId: z.string().uuid().optional(), url: z.string().min(4).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { generateSchemasForUrl } = await import("./schema.server");
    let url = data.url ?? "";
    let brand = "";
    let siteUrl = "";

    if (data.auditId) {
      const { data: audit } = await context.supabase
        .from("audits")
        .select("target_url, project_id")
        .eq("id", data.auditId)
        .maybeSingle();
      if (!audit) throw new Error("진단을 찾을 수 없습니다.");
      url = url || audit.target_url;
      const { data: project } = await context.supabase
        .from("projects")
        .select("brand_name, site_url")
        .eq("id", audit.project_id)
        .maybeSingle();
      brand = project?.brand_name ?? "";
      siteUrl = project?.site_url ?? "";
    }

    if (!url) throw new Error("검사할 주소가 없습니다.");
    return await generateSchemasForUrl({ url, brand, siteUrl });
  });



/** Publish verification history recorded on a report. */
export const listPublishVerifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ auditId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("publish_verifications")
      .select("*")
      .eq("audit_id", data.auditId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * 게시 검증을 통과한 글을 근거로 다음 콘텐츠 제안을 생성합니다.
 * 검증 통과(도달 + canonical + JSON-LD) 페이지의 제목/URL을 모아
 * 내부 링크·토픽 클러스터 관점에서 후속 콘텐츠를 추천합니다.
 */
export const getVerifiedContentSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ auditId: z.string().uuid(), refresh: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { suggestFromVerifiedPages } = await import("./followup.server");
    const { withAiCredits } = await import("./billing.server");
    const { AI_COST } = await import("./plans");
    const { supabase, userId } = context;

    const { data: audit } = await supabase
      .from("audits")
      .select("id, project_id, target_url")
      .eq("id", data.auditId)
      .maybeSingle();
    if (!audit) throw new Error("진단을 찾을 수 없습니다.");

    const { data: project } = await supabase
      .from("projects")
      .select("brand_name, site_url")
      .eq("id", audit.project_id)
      .maybeSingle();

    const { data: verified } = await supabase
      .from("publish_verifications")
      .select("url, final_url, checks, jsonld_types, has_canonical, has_jsonld, reachable, created_at")
      .eq("user_id", userId)
      .eq("reachable", true)
      .eq("has_canonical", true)
      .eq("has_jsonld", true)
      .order("created_at", { ascending: false })
      .limit(12);

    const pages = (verified ?? []).map((v) => {
      const checks = Array.isArray(v.checks) ? (v.checks as { id?: string; detail?: string }[]) : [];
      const titleCheck = checks.find((c) => c?.id === "title-match")?.detail ?? "";
      const title = titleCheck.replace(/[""]/g, "").replace(" 확인", "").trim();
      return {
        url: v.final_url || v.url,
        title: title || (v.final_url || v.url),
        schemas: v.jsonld_types ?? [],
      };
    });

    if (pages.length === 0) {
      return { pages: [], suggestions: [], note: "게시 검증을 통과한 글이 아직 없습니다. 게시 후 검증을 실행하면 후속 콘텐츠를 제안합니다." };
    }

    const suggestions = await withAiCredits(userId, AI_COST.suggestions, () =>
      suggestFromVerifiedPages({
        brand: project?.brand_name ?? "",
        siteUrl: project?.site_url ?? audit.target_url,
        pages,
      }),
      { action: "suggestions", projectId: audit.project_id, detail: "후속 콘텐츠 제안" },
    );
    return { pages, suggestions, note: "" };
  });
