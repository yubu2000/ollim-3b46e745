// Server-only: verify that a published URL is live and carries canonical + JSON-LD.
import { validateJsonLd, type SchemaIssue } from "./schema";

export type PublishCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type PublishVerification = {
  url: string;
  finalUrl: string;
  status: number;
  reachable: boolean;
  title: string;
  canonical: string;
  jsonldTypes: string[];
  schemaIssues: SchemaIssue[];
  checks: PublishCheck[];
  bodyPreview: string;
};

function extract(html: string, re: RegExp) {
  return html.match(re)?.[1]?.trim() ?? "";
}

function sameUrl(a: string, b: string) {
  const clean = (u: string) => u.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  return clean(a) === clean(b);
}

export async function verifyPublishedPage(rawUrl: string, opts?: { expectTitle?: string }): Promise<PublishVerification> {
  const url = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;

  let status = 0;
  let html = "";
  let finalUrl = url;
  let reachable = false;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GeoRankBot/1.0; +https://lovable.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    status = res.status;
    finalUrl = res.url || url;
    reachable = res.ok;
    html = await res.text();
  } catch (e) {
    return {
      url,
      finalUrl,
      status,
      reachable: false,
      title: "",
      canonical: "",
      jsonldTypes: [],
      schemaIssues: [],
      bodyPreview: "",
      checks: [
        {
          id: "reachable",
          label: "페이지 접속",
          passed: false,
          detail: `접속할 수 없습니다: ${(e as Error).message}`,
        },
      ],
    };
  }

  const title = extract(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const canonical = extract(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
    extract(html, /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);

  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => m[1] ?? "",
  );
  const jsonldTypes: string[] = [];
  const schemaIssues: SchemaIssue[] = [];
  for (const block of blocks) {
    const v = validateJsonLd(block);
    jsonldTypes.push(...v.types);
    schemaIssues.push(...v.issues);
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const noindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);

  const checks: PublishCheck[] = [
    {
      id: "reachable",
      label: "실제 방문자에게 열리는가",
      passed: reachable,
      detail: reachable ? `HTTP ${status} · ${finalUrl}` : `HTTP ${status} 응답으로 열리지 않습니다.`,
    },
    {
      id: "content",
      label: "본문이 렌더링되는가",
      passed: text.length >= 300,
      detail: `본문 텍스트 약 ${text.length}자${text.length < 300 ? " (300자 미만 — 빈 페이지이거나 JS 렌더링일 수 있습니다)" : ""}`,
    },
    {
      id: "canonical",
      label: "canonical 태그 포함",
      passed: Boolean(canonical),
      detail: canonical ? canonical : "최종 HTML에 <link rel=\"canonical\"> 가 없습니다.",
    },
    {
      id: "canonical-self",
      label: "canonical 이 이 페이지를 가리키는가",
      passed: Boolean(canonical) && sameUrl(canonical, finalUrl),
      detail: canonical
        ? sameUrl(canonical, finalUrl)
          ? "자기 자신을 정본으로 지정하고 있습니다."
          : `canonical(${canonical})이 현재 주소(${finalUrl})와 다릅니다.`
        : "canonical 이 없어 확인할 수 없습니다.",
    },
    {
      id: "jsonld",
      label: "JSON-LD 구조화 데이터 포함",
      passed: blocks.length > 0,
      detail:
        blocks.length > 0
          ? `${blocks.length}개 블록 · 타입: ${jsonldTypes.join(", ") || "미확인"}`
          : "application/ld+json 스크립트가 없습니다.",
    },
    {
      id: "schema-valid",
      label: "JSON-LD 문법·필수항목 오류 없음",
      passed: blocks.length > 0 && schemaIssues.every((i) => i.level !== "error"),
      detail:
        blocks.length === 0
          ? "검사할 스키마가 없습니다."
          : schemaIssues.filter((i) => i.level === "error").length === 0
            ? `오류 0건 (경고 ${schemaIssues.filter((i) => i.level === "warning").length}건)`
            : `오류 ${schemaIssues.filter((i) => i.level === "error").length}건`,
    },
    {
      id: "indexable",
      label: "검색엔진 색인 허용",
      passed: !noindex,
      detail: noindex ? "meta robots 에 noindex 가 설정되어 있습니다." : "noindex 설정 없음",
    },
  ];

  if (opts?.expectTitle) {
    const t = opts.expectTitle.trim().slice(0, 20);
    checks.push({
      id: "title-match",
      label: "게시한 글 제목이 노출되는가",
      passed: html.includes(t) || title.includes(t),
      detail: html.includes(t) || title.includes(t) ? `“${title || t}” 확인` : "게시한 제목을 찾지 못했습니다.",
    });
  }

  return {
    url,
    finalUrl,
    status,
    reachable,
    title,
    canonical,
    jsonldTypes,
    schemaIssues,
    checks,
    bodyPreview: text.slice(0, 400),
  };
}
