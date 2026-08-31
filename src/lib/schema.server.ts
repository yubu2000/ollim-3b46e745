// Server-only: build JSON-LD schemas from a live page's content and validate them.
import { buildSchemas, validateJsonLd, type SchemaValidation } from "./schema";
import { fetchPage, stripTags } from "./geo-engine.server";

function extract(html: string, re: RegExp) {
  return html.match(re)?.[1]?.trim() ?? "";
}

export type GeneratedSchemas = {
  source: { url: string; title: string; description: string; headings: string[]; brand: string };
  existing: { count: number; types: string[]; validation: SchemaValidation[] };
  schemas: {
    key: "article" | "faq" | "organization";
    label: string;
    json: string;
    validation: SchemaValidation;
  }[];
};

export async function generateSchemasForUrl(opts: {
  url: string;
  brand?: string;
  siteUrl?: string;
}): Promise<GeneratedSchemas> {
  const { url, html } = await fetchPage(opts.url);

  const title = extract(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    extract(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    stripTags(html).slice(0, 160);
  const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => stripTags(m[2] ?? ""))
    .filter(Boolean)
    .slice(0, 12);

  // Question-style headings + the paragraph that follows them become FAQ pairs.
  const faq: { question: string; answer: string }[] = [];
  for (const m of html.matchAll(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>([\s\S]{0,1200}?)(?=<h[2-4][\s>]|$)/gi)) {
    const q = stripTags(m[2] ?? "");
    if (!/\?|나요|까요|인가요|하나요|무엇|어떻게/.test(q)) continue;
    const answer = stripTags(m[3] ?? "").slice(0, 300);
    if (q && answer.length > 10) faq.push({ question: q, answer });
    if (faq.length >= 6) break;
  }

  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => m[1] ?? "",
  );
  const existingValidation = blocks.map((b) => validateJsonLd(b));

  const built = buildSchemas({
    url,
    title: title || opts.brand || url,
    description,
    headings,
    faq,
    brand: opts.brand ?? "",
    ...(opts.siteUrl ? { siteUrl: opts.siteUrl } : {}),
  });


  const schemas: GeneratedSchemas["schemas"] = [];
  const push = (key: "article" | "faq" | "organization", label: string, obj: unknown) => {
    if (!obj) return;
    const json = JSON.stringify(obj, null, 2);
    schemas.push({ key, label, json, validation: validateJsonLd(obj) });
  };
  push("organization", "Organization (사업자 정보)", built.organization);
  push("article", "Article (콘텐츠 페이지)", built.article);
  push("faq", "FAQPage (자주 묻는 질문)", built.faqPage);

  return {
    source: { url, title, description, headings, brand: opts.brand ?? "" },
    existing: {
      count: blocks.length,
      types: existingValidation.flatMap((v) => v.types),
      validation: existingValidation,
    },
    schemas,
  };
}
