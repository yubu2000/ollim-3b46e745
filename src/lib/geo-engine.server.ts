// Server-only engine: page fetching, rule-based SEO/GEO scoring, and LLM calls.

export type Category = "SEO" | "GEO";

export type CheckItem = {
  category: Category;
  title: string;
  passed: boolean;
  severity: "high" | "medium" | "low";
  evidence: string;
  recommendation: string;
  weight: number;
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const MENTION_MODELS: { id: string; label: string }[] = [
  { id: "google/gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 mini" },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini" },
];

export async function callModel(
  model: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY가 설정되지 않았습니다.");

  const body: Record<string, unknown> = { model, messages, stream: false };
  if (model.startsWith("openai/gpt-5.6")) body["reasoning_effort"] = "none";

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI 요청이 일시적으로 몰렸습니다. 잠시 후 다시 시도해 주세요.");
    if (res.status === 402) throw new Error("AI 크레딧이 부족합니다. Lovable 워크스페이스에서 크레딧을 충전해 주세요.");
    throw new Error(`AI 호출 실패 [${res.status}]: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export async function fetchPage(rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; GeoRankBot/1.0; +https://lovable.dev) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`페이지를 불러올 수 없습니다 (HTTP ${res.status}) — ${url}`);
  const html = await res.text();
  return { url, html };
}

function match(html: string, re: RegExp) {
  const m = html.match(re);
  return m ? m[1].trim() : "";
}

function all(html: string, re: RegExp) {
  return [...html.matchAll(re)];
}

export function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function headOk(url: string) {
  try {
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runChecks(url: string, html: string): Promise<CheckItem[]> {
  const items: CheckItem[] = [];
  const text = stripTags(html);
  const origin = new URL(url).origin;

  const title = match(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = match(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  );
  const h1s = all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  const h2s = all(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi);
  const imgs = all(html, /<img\b[^>]*>/gi).map((m) => m[0]);
  const imgsWithAlt = imgs.filter((t) => /alt=["'][^"']+["']/i.test(t));
  const canonical = match(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  const ogTitle = match(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
  const jsonLd = all(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
    .map((m) => m[1])
    .join(" ");
  const internalLinks = all(html, /<a\b[^>]+href=["']([^"']+)["']/gi).filter(
    (m) => m[1].startsWith("/") || m[1].startsWith(origin),
  );
  const lang = match(html, /<html[^>]+lang=["']([^"']*)["']/i);

  const add = (i: CheckItem) => items.push(i);

  // ---------- SEO ----------
  add({
    category: "SEO",
    title: "페이지 제목(title)",
    passed: title.length >= 10 && title.length <= 60,
    severity: "high",
    evidence: title ? `현재: "${title}" (${title.length}자)` : "title 태그가 없습니다.",
    recommendation: "핵심 키워드를 앞쪽에 두고 10~60자 사이로 작성하세요.",
    weight: 3,
  });
  add({
    category: "SEO",
    title: "메타 설명(description)",
    passed: description.length >= 50 && description.length <= 160,
    severity: "high",
    evidence: description ? `현재 ${description.length}자` : "메타 설명이 없습니다.",
    recommendation: "페이지의 핵심 가치를 50~160자로 요약해 넣으세요.",
    weight: 3,
  });
  add({
    category: "SEO",
    title: "H1 단일 사용",
    passed: h1s.length === 1,
    severity: "medium",
    evidence: `H1 ${h1s.length}개 발견`,
    recommendation: "페이지당 H1은 정확히 하나만 두고 주제를 담으세요.",
    weight: 2,
  });
  add({
    category: "SEO",
    title: "소제목(H2) 구조",
    passed: h2s.length >= 2,
    severity: "medium",
    evidence: `H2 ${h2s.length}개`,
    recommendation: "내용을 주제별 H2로 나누면 검색엔진과 AI 모두 구조를 이해하기 쉽습니다.",
    weight: 2,
  });
  add({
    category: "SEO",
    title: "이미지 대체 텍스트(alt)",
    passed: imgs.length === 0 || imgsWithAlt.length / imgs.length >= 0.8,
    severity: "medium",
    evidence: `이미지 ${imgs.length}개 중 alt 있는 이미지 ${imgsWithAlt.length}개`,
    recommendation: "이미지 80% 이상에 설명형 alt를 작성하세요.",
    weight: 2,
  });
  add({
    category: "SEO",
    title: "canonical 태그",
    passed: Boolean(canonical),
    severity: "medium",
    evidence: canonical || "canonical 링크가 없습니다.",
    recommendation: "중복 URL 문제를 막기 위해 대표 주소를 canonical로 지정하세요.",
    weight: 2,
  });
  add({
    category: "SEO",
    title: "오픈그래프(og) 태그",
    passed: Boolean(ogTitle),
    severity: "low",
    evidence: ogTitle || "og:title이 없습니다.",
    recommendation: "공유 시 노출되는 og:title/og:description/og:image를 채우세요.",
    weight: 1,
  });
  add({
    category: "SEO",
    title: "내부 링크",
    passed: internalLinks.length >= 5,
    severity: "low",
    evidence: `내부 링크 ${internalLinks.length}개`,
    recommendation: "관련 페이지로 이어지는 내부 링크를 늘려 크롤링 경로를 넓히세요.",
    weight: 1,
  });
  add({
    category: "SEO",
    title: "언어 설정(lang)",
    passed: Boolean(lang),
    severity: "low",
    evidence: lang ? `lang="${lang}"` : "html lang 속성이 없습니다.",
    recommendation: '한국어 사이트라면 <html lang="ko">를 지정하세요.',
    weight: 1,
  });

  const [robotsOk, sitemapOk, llmsOk] = await Promise.all([
    headOk(`${origin}/robots.txt`),
    headOk(`${origin}/sitemap.xml`),
    headOk(`${origin}/llms.txt`),
  ]);

  add({
    category: "SEO",
    title: "robots.txt",
    passed: robotsOk,
    severity: "medium",
    evidence: robotsOk ? `${origin}/robots.txt 확인됨` : "robots.txt를 찾지 못했습니다.",
    recommendation: "robots.txt를 두고 sitemap 위치를 명시하세요. AI 크롤러(GPTBot 등) 허용 여부도 함께 정하세요.",
    weight: 2,
  });
  add({
    category: "SEO",
    title: "sitemap.xml",
    passed: sitemapOk,
    severity: "medium",
    evidence: sitemapOk ? `${origin}/sitemap.xml 확인됨` : "sitemap.xml을 찾지 못했습니다.",
    recommendation: "공개 페이지 전체를 담은 sitemap.xml을 제공하세요.",
    weight: 2,
  });

  // ---------- GEO ----------
  const hasFaqSchema = /FAQPage/i.test(jsonLd);
  const hasOrgSchema = /(Organization|LocalBusiness|TravelAgency)/i.test(jsonLd);
  const questionHeadings = [...h2s, ...all(html, /<h3[^>]*>([\s\S]*?)<\/h3>/gi)].filter((m) =>
    /\?|어떻게|무엇|얼마|추천|비용|가격/.test(stripTags(m[1])),
  );
  const numbers = text.match(/\d[\d,.]*\s*(원|만원|박|일|명|%|km|시간)/g) ?? [];
  const firstParagraph = stripTags(match(html, /<p[^>]*>([\s\S]*?)<\/p>/i));

  add({
    category: "GEO",
    title: "구조화 데이터(JSON-LD)",
    passed: Boolean(jsonLd.trim()),
    severity: "high",
    evidence: jsonLd.trim() ? "JSON-LD 스키마가 있습니다." : "JSON-LD가 전혀 없습니다.",
    recommendation: "AI가 사실을 정확히 인용하도록 Organization/Product/FAQ 스키마를 넣으세요.",
    weight: 3,
  });
  add({
    category: "GEO",
    title: "FAQ 스키마",
    passed: hasFaqSchema,
    severity: "high",
    evidence: hasFaqSchema ? "FAQPage 스키마 확인" : "FAQPage 스키마가 없습니다.",
    recommendation: "실제 고객 질문 5~10개를 FAQPage 스키마로 제공하면 LLM 인용 확률이 크게 올라갑니다.",
    weight: 3,
  });
  add({
    category: "GEO",
    title: "브랜드/사업자 신뢰 정보",
    passed: hasOrgSchema,
    severity: "medium",
    evidence: hasOrgSchema ? "Organization 계열 스키마 확인" : "사업자 정보 스키마가 없습니다.",
    recommendation: "상호, 주소, 연락처, 등록번호를 Organization 스키마와 본문에 함께 노출하세요.",
    weight: 2,
  });
  add({
    category: "GEO",
    title: "질문형 소제목",
    passed: questionHeadings.length >= 2,
    severity: "high",
    evidence: `질문형 제목 ${questionHeadings.length}개`,
    recommendation: '"발리 허니문 비용은 얼마인가요?"처럼 사용자가 실제로 묻는 문장을 소제목으로 쓰세요.',
    weight: 3,
  });
  add({
    category: "GEO",
    title: "인용 가능한 수치·사실",
    passed: numbers.length >= 3,
    severity: "high",
    evidence: `구체 수치 ${numbers.length}건 발견`,
    recommendation: "가격, 기간, 인원, 후기 수 같은 구체적인 숫자를 본문에 명시하세요. AI는 수치가 있는 문장을 더 잘 인용합니다.",
    weight: 3,
  });
  add({
    category: "GEO",
    title: "요약 문단(첫 문단)",
    passed: firstParagraph.length >= 80,
    severity: "medium",
    evidence: firstParagraph ? `${firstParagraph.length}자` : "첫 문단을 찾지 못했습니다.",
    recommendation: "페이지 맨 위에 2~3문장짜리 직답 요약을 두면 AI가 그대로 인용하기 좋습니다.",
    weight: 2,
  });
  add({
    category: "GEO",
    title: "본문 분량",
    passed: text.length >= 800,
    severity: "medium",
    evidence: `본문 약 ${text.length}자`,
    recommendation: "핵심 주제당 800자 이상으로 깊이 있게 다루세요.",
    weight: 2,
  });
  add({
    category: "GEO",
    title: "llms.txt 제공",
    passed: llmsOk,
    severity: "low",
    evidence: llmsOk ? "llms.txt 확인됨" : "llms.txt가 없습니다.",
    recommendation: "AI에게 사이트 핵심 정보를 요약해 알려주는 /llms.txt 파일을 추가해 보세요.",
    weight: 1,
  });

  return items;
}

export function score(items: CheckItem[], category: Category) {
  const scoped = items.filter((i) => i.category === category);
  const total = scoped.reduce((s, i) => s + i.weight, 0);
  const got = scoped.reduce((s, i) => s + (i.passed ? i.weight : 0), 0);
  return total === 0 ? 0 : Math.round((got / total) * 100);
}

export async function summarize(url: string, items: CheckItem[], brand: string) {
  const failed = items.filter((i) => !i.passed);
  const prompt = `너는 GEO(생성형 엔진 최적화)와 SEO 컨설턴트다. 아래는 "${brand}" 브랜드의 페이지 ${url} 진단 결과다.
실패 항목:
${failed.map((f) => `- [${f.category}] ${f.title}: ${f.evidence}`).join("\n") || "없음"}

한국어로 3~4문장 요약을 쓰고, 가장 먼저 고쳐야 할 3가지를 우선순위대로 짧게 제시해라. 마크다운 제목 없이 평문으로.`;
  try {
    return await callModel("google/gemini-3.7-flash", [{ role: "user", content: prompt }]);
  } catch {
    return "AI 요약을 생성하지 못했습니다. 아래 항목별 결과를 참고하세요.";
  }
}

export function analyzeMention(answer: string, brand: string, competitors: string[]) {
  const lower = answer.toLowerCase();
  const idx = lower.indexOf(brand.toLowerCase());
  const mentioned = idx >= 0;

  const foundCompetitors = competitors.filter((c) => c && lower.includes(c.toLowerCase()));

  let rank: number | null = null;
  if (mentioned) {
    const positions = [
      { name: brand, at: idx },
      ...foundCompetitors.map((c) => ({ name: c, at: lower.indexOf(c.toLowerCase()) })),
    ].sort((a, b) => a.at - b.at);
    rank = positions.findIndex((p) => p.name === brand) + 1;
  }

  const excerpt = mentioned
    ? answer.slice(Math.max(0, idx - 120), idx + 200).trim()
    : answer.slice(0, 220).trim();

  return { mentioned, rank, excerpt, competitors: foundCompetitors };
}
