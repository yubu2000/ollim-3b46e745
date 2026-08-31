// Server-only: keyword & content suggestions for an audited page.
import { callModel, fetchPage, stripTags } from "./geo-engine.server";
import { computeSiteMetrics } from "./site-metrics.server";
import type { GscQueryRow } from "./gsc.server";

export type KeywordIdea = {
  keyword: string;
  intent: string;
  reason: string;
  priority: "high" | "medium" | "low";
  source: "search-console" | "on-page" | "ai";
  metrics?: { clicks: number; impressions: number; ctr: number; position: number } | null;
};

export type ContentIdea = {
  title: string;
  targetKeyword: string;
  format: string;
  outline: string[];
};

export type KeywordSuggestions = {
  generatedAt: string;
  usedSearchConsole: boolean;
  keywords: KeywordIdea[];
  contents: ContentIdea[];
  quickWins: string[];
};

function parseJson(raw: string) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function buildKeywordSuggestions(opts: {
  url: string;
  brand: string;
  gscQueries: GscQueryRow[];
}): Promise<KeywordSuggestions> {
  const { url, brand, gscQueries } = opts;
  const { html } = await fetchPage(url);
  const metrics = computeSiteMetrics(url, html);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const excerpt = stripTags(html).slice(0, 2500);

  // Quick wins straight from Search Console: high impressions, weak position/CTR.
  const quickWinRows = gscQueries
    .filter((q) => q.impressions >= 20 && q.position > 5 && q.position <= 25)
    .slice(0, 5);

  const gscBlock =
    gscQueries.length > 0
      ? gscQueries
          .slice(0, 20)
          .map(
            (q) =>
              `- "${q.query}" 노출 ${q.impressions} · 클릭 ${q.clicks} · CTR ${q.ctr}% · 평균순위 ${q.position}`,
          )
          .join("\n")
      : "(Search Console 데이터 없음)";

  const prompt = `너는 한국어 SEO/GEO 콘텐츠 전략가다.
브랜드: ${brand}
페이지: ${url}
제목: ${title}
본문 주요 단어(빈도순): ${metrics.keywords.map((k) => `${k.term}(${k.count})`).join(", ")}
본문 발췌:
"""
${excerpt}
"""
Google Search Console 실제 검색어 데이터:
${gscBlock}

아래 JSON 스키마 그대로, 설명 없이 JSON만 출력해라.
{
 "keywords": [{"keyword":"", "intent":"정보형|비교형|거래형|지역형", "reason":"왜 이 키워드를 노려야 하는지 1문장(가능하면 실제 노출/순위 수치 인용)", "priority":"high|medium|low", "source":"search-console|on-page|ai"}],
 "contents": [{"title":"작성할 콘텐츠 제목", "targetKeyword":"", "format":"가이드|비교표|FAQ|후기|체크리스트", "outline":["소제목1","소제목2","소제목3","소제목4"]}],
 "quickWins": ["지금 바로 고칠 수 있는 개선안 1문장"]
}
keywords 8개, contents 4개, quickWins 4개. Search Console 데이터가 있으면 노출은 많은데 순위/CTR이 낮은 검색어를 우선 포함해라. 모두 한국어로.`;

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = parseJson(await callModel("google/gemini-3.7-flash", [{ role: "user", content: prompt }]));
  } catch {
    parsed = null;
  }

  const keywords: KeywordIdea[] = Array.isArray(parsed?.["keywords"])
    ? (parsed["keywords"] as KeywordIdea[]).slice(0, 10).map((k) => {
        const hit = gscQueries.find((q) => q.query === k.keyword);
        return {
          keyword: String(k.keyword ?? ""),
          intent: String(k.intent ?? "정보형"),
          reason: String(k.reason ?? ""),
          priority: (["high", "medium", "low"] as const).includes(k.priority) ? k.priority : "medium",
          source: hit ? "search-console" : (k.source ?? "ai"),
          metrics: hit
            ? { clicks: hit.clicks, impressions: hit.impressions, ctr: hit.ctr, position: hit.position }
            : null,
        };
      })
    : metrics.keywords.slice(0, 8).map((k) => ({
        keyword: k.term,
        intent: "정보형",
        reason: `본문에서 ${k.count}회 사용(밀도 ${k.density}%)${k.inTitle ? ", 제목에도 포함" : ", 제목에는 없음"}`,
        priority: k.inTitle ? "medium" : "high",
        source: "on-page" as const,
        metrics: null,
      }));

  const contents: ContentIdea[] = Array.isArray(parsed?.["contents"])
    ? (parsed["contents"] as ContentIdea[]).slice(0, 6).map((c) => ({
        title: String(c.title ?? ""),
        targetKeyword: String(c.targetKeyword ?? ""),
        format: String(c.format ?? "가이드"),
        outline: Array.isArray(c.outline) ? c.outline.map(String).slice(0, 8) : [],
      }))
    : [];

  const quickWins = [
    ...quickWinRows.map(
      (q) =>
        `"${q.query}"는 노출 ${q.impressions}회에 평균순위 ${q.position}위 — 이 검색어를 제목/소제목에 넣은 전용 섹션을 만들면 1페이지 진입 가능성이 높습니다.`,
    ),
    ...(Array.isArray(parsed?.["quickWins"]) ? (parsed["quickWins"] as unknown[]).map(String) : []),
  ].slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    usedSearchConsole: gscQueries.length > 0,
    keywords,
    contents,
    quickWins,
  };
}
