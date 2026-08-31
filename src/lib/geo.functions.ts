import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MENTION_MODELS,
  analyzeMention,
  callModel,
  fetchPage,
  runChecks,
  score,
  summarize,
} from "./geo-engine.server";

export const runAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), url: z.string().min(3) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertQuota, consume } = await import("./billing.server");
    const { checkAuditAlert } = await import("./alerts.server");
    await assertQuota(userId, "audit");

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { url, html } = await fetchPage(data.url || project.site_url);
    const items = await runChecks(url, html);
    const seo = score(items, "SEO");
    const geo = score(items, "GEO");
    const summary = await summarize(url, items, project.brand_name);


    const { data: audit, error } = await supabase
      .from("audits")
      .insert({
        project_id: project.id,
        user_id: userId,
        target_url: url,
        seo_score: seo,
        geo_score: geo,
        status: "completed",
        summary,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: itemsError } = await supabase.from("audit_items").insert(
      items.map((i) => ({
        audit_id: audit.id,
        user_id: userId,
        category: i.category,
        title: i.title,
        passed: i.passed,
        severity: i.severity,
        evidence: i.evidence,
        recommendation: i.recommendation,
        weight: i.weight,
      })),
    );
    if (itemsError) throw new Error(itemsError.message);

    await consume(userId, "audit");
    await checkAuditAlert(project.id, project.name, geo, url);

    return { auditId: audit.id, seo, geo };
  });


export const runMentionCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { data: prompts } = await supabase
      .from("prompts")
      .select("*")
      .eq("project_id", project.id);
    if (!prompts || prompts.length === 0)
      throw new Error("추적할 질문을 먼저 추가해 주세요.");

    const rows: Record<string, unknown>[] = [];

    for (const prompt of prompts) {
      for (const model of MENTION_MODELS) {
        try {
          const answer = await callModel(model.id, [
            {
              role: "system",
              content:
                "너는 사용자의 질문에 실제 업체·브랜드 이름을 구체적으로 들어 추천하는 검색 도우미다. 한국어로 간결하게 답하라.",
            },
            { role: "user", content: prompt.text },
          ]);
          const result = analyzeMention(answer, project.brand_name, project.competitors ?? []);
          rows.push({
            prompt_id: prompt.id,
            project_id: project.id,
            user_id: userId,
            model: model.id,
            model_label: model.label,
            mentioned: result.mentioned,
            rank: result.rank,
            excerpt: result.excerpt,
            competitors: result.competitors,
            raw_response: answer.slice(0, 4000),
          });
        } catch (error) {
          rows.push({
            prompt_id: prompt.id,
            project_id: project.id,
            user_id: userId,
            model: model.id,
            model_label: model.label,
            mentioned: false,
            rank: null,
            excerpt: error instanceof Error ? error.message : "실행 실패",
            competitors: [],
            raw_response: null,
          });
        }
      }
    }

    const { error } = await supabase.from("mention_runs").insert(rows as never);
    if (error) throw new Error(error.message);

    return { runs: rows.length };
  });

export const optimizeContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        brand: z.string().min(1),
        topic: z.string().min(1),
        content: z.string().min(20),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const prompt = `너는 GEO(생성형 엔진 최적화) 전문 에디터다.
브랜드: ${data.brand}
주제: ${data.topic}
원본 콘텐츠:
"""
${data.content.slice(0, 6000)}
"""

다음 형식으로 한국어 답변을 작성해라 (각 구분선 표기를 정확히 지켜라):

===REWRITE===
(AI가 인용하기 좋은 구조로 재작성한 본문. 맨 위 2~3문장 직답 요약, 이어서 질문형 소제목과 구체적 수치를 포함)

===FAQ===
(FAQPage JSON-LD 코드만. <script type="application/ld+json"> 태그 포함, 질문 5개)

===TIPS===
(추가 개선 팁 5개, 각 한 줄)`;

    const raw = await callModel("google/gemini-3.7-flash", [{ role: "user", content: prompt }]);
    const part = (name: string) => {
      const re = new RegExp(`===${name}===([\\s\\S]*?)(?====|$)`);
      return raw.match(re)?.[1]?.trim() ?? "";
    };
    return {
      rewrite: part("REWRITE") || raw,
      faq: part("FAQ"),
      tips: part("TIPS"),
    };
  });
