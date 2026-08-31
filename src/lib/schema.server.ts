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

  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => m[1] ?? "",
  );
  const existingValidation = blocks.map((b) => validateJsonLd(b));

  const built = buildSchemas({
    url,
    title: title || opts.brand || url,
    description,
    headings,
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
