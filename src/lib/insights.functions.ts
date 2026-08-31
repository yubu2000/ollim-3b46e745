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
    const { supabase, userId } = context;

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

/** Publish a generated draft to the connected WordPress blog. */
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
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { articleToHtml, publishPost } = await import("./wordpress.server");
    let ld: unknown = undefined;
    if (data.jsonld) {
      try {
        ld = JSON.parse(data.jsonld);
      } catch {
        ld = undefined;
      }
    }
    const contentHtml = articleToHtml({
      title: data.title,
      markdown: data.markdown,
      faq: data.faq,
      ...(ld ? { jsonld: ld } : {}),
    });
    return await publishPost({
      title: data.title,
      contentHtml,
      excerpt: data.metaDescription,
      status: data.status,
    });
  });

/** Fetch a published URL and check it is live with canonical + valid JSON-LD. */
export const verifyPublishedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ url: z.string().min(4), expectTitle: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyPublishedPage } = await import("./publish-verify.server");
    return await verifyPublishedPage(data.url, data.expectTitle ? { expectTitle: data.expectTitle } : {});
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


