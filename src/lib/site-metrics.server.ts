// Server-only detail metrics for competitor comparison:
// keyword ranking, link frequency, content length.
import { stripTags } from "./geo-engine.server";

export type KeywordStat = { term: string; count: number; density: number; inTitle: boolean };

export type SiteMetrics = {
  chars: number;
  words: number;
  paragraphs: number;
  headings: number;
  images: number;
  internalLinks: number;
  externalLinks: number;
  totalLinks: number;
  linksPer1000Words: number;
  jsonLdBlocks: number;
  keywords: KeywordStat[];
};

const STOPWORDS = new Set([
  "그리고", "하지만", "합니다", "입니다", "있습니다", "없습니다", "위해", "대한", "우리",
  "가능", "경우", "이용", "고객", "서비스", "안내", "확인", "제공", "모든", "여러분",
  "the", "and", "for", "you", "with", "your", "our", "are", "this", "that", "from",
  "was", "will", "can", "all", "not", "have", "has", "more", "about", "www", "com",
  "https", "http", "img", "div", "span",
]);

function tokenize(text: string) {
  return (text.toLowerCase().match(/[가-힣]{2,}|[a-z][a-z0-9]{2,}/g) ?? []).filter(
    (t) => !STOPWORDS.has(t),
  );
}

export function computeSiteMetrics(url: string, html: string): SiteMetrics {
  const origin = new URL(url).origin;
  const text = stripTags(html);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").toLowerCase();

  const links = [...html.matchAll(/<a\b[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1] ?? "");
  const internalLinks = links.filter(
    (h) => h.startsWith("/") || h.startsWith("#/") || h.startsWith(origin),
  ).length;
  const externalLinks = links.filter((h) => /^https?:\/\//i.test(h) && !h.startsWith(origin)).length;

  const headings = [...html.matchAll(/<h[1-6][^>]*>/gi)].length;
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].length;
  const paragraphs = [...html.matchAll(/<p\b[^>]*>/gi)].length;
  const jsonLdBlocks = [...html.matchAll(/type=["']application\/ld\+json["']/gi)].length;

  const tokens = tokenize(text);
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  const keywords: KeywordStat[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({
      term,
      count,
      density: tokens.length === 0 ? 0 : Math.round((count / tokens.length) * 10000) / 100,
      inTitle: title.includes(term),
    }));

  const words = tokens.length;
  return {
    chars: text.length,
    words,
    paragraphs,
    headings,
    images,
    internalLinks,
    externalLinks,
    totalLinks: links.length,
    linksPer1000Words: words === 0 ? 0 : Math.round((links.length / words) * 1000 * 10) / 10,
    jsonLdBlocks,
    keywords,
  };
}
