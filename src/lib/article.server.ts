// Server-only: full article drafting from a recommended title + outline.
import { callModel } from "./geo-engine.server";

export type FaqPair = { question: string; answer: string };

export type ArticleDraft = {
  title: string;
  targetKeyword: string;
  format: string;
  outline: string[];
  markdown: string;
  metaTitle: string;
  metaDescription: string;
  faq: FaqPair[];
  jsonld: Record<string, unknown>;
  wordCount: number;
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

export async function draftArticle(opts: {
  title: string;
  targetKeyword: string;
  format: string;
  outline: string[];
  brand: string;
  siteUrl: string;
  supportingKeywords?: string[];
  tone?: string;
  length?: "short" | "medium" | "long";
}): Promise<ArticleDraft> {
  const {
    title,
    targetKeyword,
    format,
    outline,
    brand,
    siteUrl,
    supportingKeywords = [],
    tone = "전문적이고 친근한",
    length = "medium",
  } = opts;

  const targetWords = length === "short" ? 800 : length === "long" ? 2200 : 1400;

  const prompt = `너는 한국어 SEO/GEO(생성형 검색 최적화) 콘텐츠 작가다.
브랜드: ${brand || "(미지정)"}
사이트: ${siteUrl}
작성할 글 제목: ${title}
콘텐츠 형식: ${format}
타깃 키워드: ${targetKeyword}
보조 키워드: ${supportingKeywords.join(", ") || "(없음)"}
목차:
${outline.map((o, i) => `${i + 1}. ${o}`).join("\n") || "(목차 없음 — 직접 구성)"}

요구사항:
- 한국어, ${tone} 톤, 약 ${targetWords}자 분량의 완성된 본문.
- 마크다운으로 작성. H1은 쓰지 말고 ## / ### 소제목으로 목차를 그대로 따른다.
- LLM이 인용하기 좋도록: 각 섹션 첫 문장은 질문에 대한 직접적인 결론, 구체적 수치·기간·비용·절차를 포함, 불릿과 표를 적절히 사용.
- 과장·허위 정보 금지. 확실하지 않은 수치는 "일반적으로", "평균" 같은 표현으로 완화.
- 마지막에 자연스러운 CTA 한 문단.

아래 JSON 스키마 그대로, 설명 없이 JSON만 출력해라.
{
 "metaTitle": "60자 이내 검색 제목",
 "metaDescription": "155자 이내 검색 설명",
 "markdown": "본문 마크다운 전체",
 "faq": [{"question":"", "answer":"2~3문장 답변"}]
}
faq는 4개, 실제 사람들이 검색할 법한 질문으로.`;

  const raw = await callModel("google/gemini-3.7-flash", [{ role: "user", content: prompt }]);
  const parsed = parseJson(raw);

  const markdown = String(parsed?.["markdown"] ?? raw ?? "").trim();
  const faq: FaqPair[] = Array.isArray(parsed?.["faq"])
    ? (parsed["faq"] as FaqPair[]).slice(0, 8).map((f) => ({
        question: String(f?.question ?? ""),
        answer: String(f?.answer ?? ""),
      }))
    : [];

  const metaTitle = String(parsed?.["metaTitle"] ?? title).slice(0, 70);
  const metaDescription = String(parsed?.["metaDescription"] ?? "").slice(0, 200);

  const jsonld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: title,
        description: metaDescription,
        keywords: [targetKeyword, ...supportingKeywords].filter(Boolean).join(", "),
        author: { "@type": "Organization", name: brand || siteUrl },
        publisher: { "@type": "Organization", name: brand || siteUrl },
        datePublished: new Date().toISOString().slice(0, 10),
      },
      ...(faq.length > 0
        ? [
            {
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({
                "@type": "Question",
                name: f.question,
                acceptedAnswer: { "@type": "Answer", text: f.answer },
              })),
            },
          ]
        : []),
    ],
  };

  return {
    title,
    targetKeyword,
    format,
    outline,
    markdown,
    metaTitle,
    metaDescription,
    faq,
    jsonld,
    wordCount: markdown.replace(/\s+/g, " ").trim().split(" ").length,
  };
}
