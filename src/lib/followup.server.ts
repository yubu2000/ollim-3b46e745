// Server-only: build follow-up content suggestions from verified published pages.
import { callModel } from "./geo-engine.server";

export type VerifiedPage = { url: string; title: string; schemas: string[] };

export type FollowupSuggestion = {
  title: string;
  targetKeyword: string;
  format: string;
  outline: string[];
  intent: string;
  internalLinks: string[];
  seoGain: string;
};

function parseJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}

export async function suggestFromVerifiedPages(input: {
  brand: string;
  siteUrl: string;
  pages: VerifiedPage[];
}): Promise<FollowupSuggestion[]> {
  const list = input.pages
    .map((p, i) => `${i + 1}. ${p.title} — ${p.url} (스키마: ${p.schemas.join(", ") || "없음"})`)
    .join("\n");

  const prompt = `너는 한국어 SEO/GEO 전략가다.
브랜드: ${input.brand}
사이트: ${input.siteUrl}

아래는 이미 게시되어 검증(도달·canonical·JSON-LD)을 통과한 글 목록이다.
${list}

이 글들과 토픽 클러스터를 이루면서 SEO 점수와 LLM 인용 가능성을 높일 후속 콘텐츠 5개를 제안해라.
- 이미 있는 글과 중복되지 않게, 검색 의도를 넓히거나 깊게 파는 주제를 골라라.
- 각 제안마다 위 목록 중 내부 링크로 연결할 URL을 1~2개 지정해라.
- 목차는 질문형 소제목 위주로 4~6개.

JSON만 출력:
{"suggestions":[{"title":"","targetKeyword":"","format":"가이드|비교|체크리스트|사례","outline":["",""],"intent":"정보형|비교형|거래형","internalLinks":["https://..."],"seoGain":"이 글이 올려줄 지표를 한 문장으로"}]}`;

  const raw = await callModel("google/gemini-3.7-flash", [{ role: "user", content: prompt }]);
  const parsed = parseJson(raw) as { suggestions?: FollowupSuggestion[] };
  return (parsed.suggestions ?? []).slice(0, 5).map((s) => ({
    title: String(s.title ?? "").trim(),
    targetKeyword: String(s.targetKeyword ?? "").trim(),
    format: String(s.format ?? "가이드").trim(),
    outline: Array.isArray(s.outline) ? s.outline.map(String).slice(0, 8) : [],
    intent: String(s.intent ?? "").trim(),
    internalLinks: Array.isArray(s.internalLinks) ? s.internalLinks.map(String).slice(0, 3) : [],
    seoGain: String(s.seoGain ?? "").trim(),
  }));
}
