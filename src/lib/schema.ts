// Client-safe JSON-LD builders + validator (no network, no secrets).

export type SchemaIssue = {
  level: "error" | "warning";
  path: string;
  message: string;
};

export type SchemaValidation = {
  valid: boolean;
  types: string[];
  issues: SchemaIssue[];
};

const REQUIRED: Record<string, string[]> = {
  Article: ["headline", "author", "datePublished"],
  BlogPosting: ["headline", "author", "datePublished"],
  NewsArticle: ["headline", "author", "datePublished"],
  FAQPage: ["mainEntity"],
  Organization: ["name", "url"],
  LocalBusiness: ["name", "url"],
  Product: ["name"],
  BreadcrumbList: ["itemListElement"],
  WebSite: ["name", "url"],
};

const RECOMMENDED: Record<string, string[]> = {
  Article: ["description", "image", "dateModified", "mainEntityOfPage"],
  BlogPosting: ["description", "image", "dateModified", "mainEntityOfPage"],
  Organization: ["logo", "description", "sameAs"],
  LocalBusiness: ["telephone", "address", "areaServed"],
  WebSite: ["potentialAction"],
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateNode(node: unknown, path: string, issues: SchemaIssue[], types: string[]) {
  if (!isObject(node)) {
    issues.push({ level: "error", path, message: "객체 형식이 아닙니다." });
    return;
  }
  const type = node["@type"];
  const typeName = Array.isArray(type) ? String(type[0] ?? "") : typeof type === "string" ? type : "";
  if (!typeName) {
    issues.push({ level: "error", path, message: "@type 이 없습니다. 예: \"@type\": \"Article\"" });
  } else {
    types.push(typeName);
  }

  const required = REQUIRED[typeName] ?? [];
  for (const key of required) {
    const value = node[key];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      issues.push({
        level: "error",
        path: `${path}.${key}`,
        message: `${typeName} 스키마의 필수 항목 "${key}" 이(가) 비어 있습니다.`,
      });
    }
  }
  for (const key of RECOMMENDED[typeName] ?? []) {
    if (node[key] === undefined) {
      issues.push({
        level: "warning",
        path: `${path}.${key}`,
        message: `"${key}" 을(를) 추가하면 검색·AI 인용 품질이 올라갑니다.`,
      });
    }
  }

  if (typeName === "FAQPage") {
    const list = node["mainEntity"];
    const arr = Array.isArray(list) ? list : list ? [list] : [];
    if (arr.length < 2) {
      issues.push({
        level: "warning",
        path: `${path}.mainEntity`,
        message: "질문이 2개 미만입니다. 4~6개를 권장합니다.",
      });
    }
    arr.forEach((q, i) => {
      const p = `${path}.mainEntity[${i}]`;
      if (!isObject(q)) {
        issues.push({ level: "error", path: p, message: "Question 객체가 아닙니다." });
        return;
      }
      if (q["@type"] !== "Question") {
        issues.push({ level: "error", path: p, message: '@type 은 "Question" 이어야 합니다.' });
      }
      if (!q["name"]) issues.push({ level: "error", path: `${p}.name`, message: "질문 문장(name)이 없습니다." });
      const a = q["acceptedAnswer"];
      if (!isObject(a)) {
        issues.push({ level: "error", path: `${p}.acceptedAnswer`, message: "acceptedAnswer 가 없습니다." });
      } else {
        if (a["@type"] !== "Answer")
          issues.push({ level: "error", path: `${p}.acceptedAnswer`, message: '@type 은 "Answer" 여야 합니다.' });
        if (!a["text"])
          issues.push({ level: "error", path: `${p}.acceptedAnswer.text`, message: "답변 본문(text)이 없습니다." });
      }
    });
  }

  if (typeName === "BreadcrumbList") {
    const arr = Array.isArray(node["itemListElement"]) ? node["itemListElement"] : [];
    arr.forEach((it, i) => {
      if (isObject(it) && it["position"] === undefined) {
        issues.push({
          level: "error",
          path: `${path}.itemListElement[${i}].position`,
          message: "position 값이 필요합니다.",
        });
      }
    });
  }

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@")) continue;
    if (typeof value === "string" && /^https?:\/\//.test(value) === false && /url$/i.test(key)) {
      issues.push({ level: "error", path: `${path}.${key}`, message: "URL은 절대주소(https://…)여야 합니다." });
    }
  }
}

/** Validate a JSON-LD string or object graph. */
export function validateJsonLd(input: string | unknown): SchemaValidation {
  let parsed: unknown = input;
  const issues: SchemaIssue[] = [];
  const types: string[] = [];

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      return { valid: false, types: [], issues: [{ level: "error", path: "$", message: "내용이 비어 있습니다." }] };
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      return {
        valid: false,
        types: [],
        issues: [{ level: "error", path: "$", message: `JSON 문법 오류: ${(e as Error).message}` }],
      };
    }
  }

  const nodes = Array.isArray(parsed)
    ? parsed
    : isObject(parsed) && Array.isArray(parsed["@graph"])
      ? (parsed["@graph"] as unknown[])
      : [parsed];

  if (isObject(parsed) && !parsed["@context"]) {
    issues.push({
      level: "error",
      path: "$.@context",
      message: '"@context": "https://schema.org" 가 필요합니다.',
    });
  }

  nodes.forEach((n, i) => validateNode(n, nodes.length > 1 ? `$[${i}]` : "$", issues, types));

  return { valid: issues.every((i) => i.level !== "error"), types, issues };
}

export type SchemaSource = {
  url: string;
  title: string;
  description: string;
  headings: string[];
  faq?: { question: string; answer: string }[];
  brand?: string;
  siteUrl?: string;
  logoUrl?: string;
  telephone?: string;
  sameAs?: string[];
  datePublished?: string;
};

/** Build Article / FAQPage / Organization JSON-LD from page content. */
export function buildSchemas(src: SchemaSource) {
  const today = (src.datePublished ?? new Date().toISOString()).slice(0, 10);
  const brand = src.brand || new URL(src.siteUrl || src.url).hostname;

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: src.title.slice(0, 110),
    description: src.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": src.url },
    author: { "@type": "Organization", name: brand },
    publisher: {
      "@type": "Organization",
      name: brand,
      ...(src.logoUrl ? { logo: { "@type": "ImageObject", url: src.logoUrl } } : {}),
    },
    datePublished: today,
    dateModified: today,
    articleSection: src.headings.slice(0, 8),
  };

  const questions = (src.faq && src.faq.length > 0
    ? src.faq
    : src.headings
        .filter((h) => /\?|나요|까요|인가요|하나요/.test(h))
        .slice(0, 6)
        .map((h) => ({ question: h, answer: "" }))
  ).filter((q) => q.question && q.answer.trim().length > 0);

  const faqPage =
    questions.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: questions.map((q) => ({
            "@type": "Question",
            name: q.question,
            acceptedAnswer: { "@type": "Answer", text: q.answer },
          })),
        }
      : null;

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand,
    url: src.siteUrl || new URL(src.url).origin,
    description: src.description,
    ...(src.logoUrl ? { logo: src.logoUrl } : {}),
    ...(src.telephone ? { telephone: src.telephone } : {}),
    ...(src.sameAs && src.sameAs.length > 0 ? { sameAs: src.sameAs } : {}),
  };

  return { article, faqPage, organization };
}
