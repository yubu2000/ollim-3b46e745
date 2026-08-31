// Server-only: keyword research — Google autocomplete + AI question/topic generation.
import { callModel } from "./geo-engine.server";

export type KeywordResearch = {
  keyword: string;
  googleSuggestions: string[];
  topics: { topic: string; description: string }[];
  questions: { question: string; intent: string; source: "chatgpt" | "people-also-ask" }[];
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

/** Google autocomplete suggestions (public endpoint, no key). */
async function googleSuggest(keyword: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&gl=kr&q=${encodeURIComponent(keyword)}`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as [string, string[]];
    return Array.isArray(json?.[1]) ? json[1].slice(0, 10) : [];
  } catch {
    return [];
  }
}

export async function researchKeyword(keyword: string): Promise<KeywordResearch> {
  const suggestions = await googleSuggest(keyword);

  const prompt = `너는 한국어 SEO/GEO 콘텐츠 전략가다.
사용자가 입력한 키워드: "${keyword}"
Google 자동완성 검색어:
${suggestions.length > 0 ? suggestions.map((s) => `- ${s}`).join("\n") : "(없음)"}

이 키워드와 관련해 아래 JSON 스키마 그대로, 설명 없이 JSON만 출력해라.
{
 "topics": [{"topic":"관련 주제", "description":"왜 이 주제가 중요한지 1문장"}],
 "questions": [{"question":"사용자가 ChatGPT 같은 AI에게 실제로 물어볼 만한 질문 문장", "intent":"정보형|비교형|거래형|방법형", "source":"chatgpt"}]
}
topics 6개, questions 10개. questions는 AI 답변에 인용되기 좋은 구체적 질문 형태로, 일부는 "people-also-ask"(구글 연관 질문 스타일)로 표시해도 된다. 모두 한국어로.`;

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = parseJson(await callModel("google/gemini-3.7-flash", [{ role: "user", content: prompt }]));
  } catch {
    parsed = null;
  }

  const topics = Array.isArray(parsed?.["topics"])
    ? (parsed["topics"] as { topic?: unknown; description?: unknown }[])
        .slice(0, 8)
        .map((t) => ({ topic: String(t.topic ?? ""), description: String(t.description ?? "") }))
        .filter((t) => t.topic)
    : [];

  const questions = Array.isArray(parsed?.["questions"])
    ? (parsed["questions"] as { question?: unknown; intent?: unknown; source?: unknown }[])
        .slice(0, 12)
        .map((q) => ({
          question: String(q.question ?? ""),
          intent: String(q.intent ?? "정보형"),
          source: (q.source === "people-also-ask" ? "people-also-ask" : "chatgpt") as
            | "chatgpt"
            | "people-also-ask",
        }))
        .filter((q) => q.question)
    : [];

  return { keyword, googleSuggestions: suggestions, topics, questions };
}
