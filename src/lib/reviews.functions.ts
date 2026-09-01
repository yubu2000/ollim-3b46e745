import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReviewPlatform = {
  id: string;
  name: string;
  why: string;
  action: string;
  url: string;
};

/** AI 검색이 평점·리뷰 수를 읽어가는 대표 채널 체크리스트. */
const PLATFORMS: ReviewPlatform[] = [
  {
    id: "google-business",
    name: "Google 비즈니스 프로필",
    why: "ChatGPT·Gemini가 브랜드 평점을 인용할 때 가장 먼저 참조하는 소스입니다.",
    action: "프로필을 소유 인증하고 리뷰 요청 링크(g.page/r/...)를 결제·상담 완료 문자에 넣으세요.",
    url: "https://business.google.com/",
  },
  {
    id: "naver-place",
    name: "네이버 플레이스 / 스마트플레이스",
    why: "한국어 질의 응답에서 평점·방문자 리뷰가 그대로 인용됩니다.",
    action: "업체 정보를 최신화하고 영수증 리뷰 이벤트로 월 10건 이상 신규 리뷰를 유지하세요.",
    url: "https://smartplace.naver.com/",
  },
  {
    id: "kakao-map",
    name: "카카오맵 / 카카오 채널",
    why: "지역·업종 질의에서 보조 근거로 자주 인용됩니다.",
    action: "장소 정보를 등록하고 상담 종료 시 카카오 채널로 별점 요청 메시지를 보내세요.",
    url: "https://map.kakao.com/",
  },
  {
    id: "own-site",
    name: "내 사이트의 리뷰 페이지",
    why: "AggregateRating JSON-LD가 있어야 모델이 '공식 평점'으로 신뢰합니다.",
    action: "리뷰 전용 URL(/reviews)을 만들고 아래 JSON-LD를 <head>에 넣으세요.",
    url: "",
  },
  {
    id: "ugc",
    name: "블로그·유튜브·커뮤니티 후기",
    why: "모델은 서로 다른 출처에서 같은 평점이 반복될 때 신뢰도를 올립니다.",
    action: "실사용 후기 콘텐츠에 브랜드명 + 평점 문장을 명시적으로 포함하도록 요청하세요.",
    url: "",
  },
];

function buildReviewSchema(opts: {
  brand: string;
  url: string;
  rating: number;
  reviewCount: number;
  itemType: "Organization" | "LocalBusiness" | "Product";
  samples: { author: string; rating: number; body: string }[];
}) {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": opts.itemType,
    name: opts.brand,
    url: opts.url,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: Number(opts.rating.toFixed(1)),
      reviewCount: opts.reviewCount,
      bestRating: 5,
      worstRating: 1,
    },
  };
  if (opts.samples.length > 0) {
    node["review"] = opts.samples.map((s) => ({
      "@type": "Review",
      author: { "@type": "Person", name: s.author },
      reviewRating: { "@type": "Rating", ratingValue: s.rating, bestRating: 5, worstRating: 1 },
      reviewBody: s.body,
    }));
  }
  return node;
}

/**
 * 프로젝트 도메인 기준으로 평점·리뷰(AggregateRating) JSON-LD를 만들고,
 * 실제 사이트에 반영됐는지 라이브로 확인합니다.
 */
export const getReviewSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        rating: z.number().min(1).max(5).default(4.8),
        reviewCount: z.number().int().min(0).default(85),
        itemType: z.enum(["Organization", "LocalBusiness", "Product"]).default("Organization"),
        verifyUrl: z.string().optional(),
        verify: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project } = await supabase
      .from("projects")
      .select("id, name, brand_name, site_url")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const origin = new URL(
      /^https?:\/\//i.test(project.site_url) ? project.site_url : `https://${project.site_url}`,
    ).origin;
    const brand = project.brand_name || project.name;

    const schema = buildReviewSchema({
      brand,
      url: `${origin}/`,
      rating: data.rating,
      reviewCount: data.reviewCount,
      itemType: data.itemType,
      samples: [
        {
          author: "실제 고객명",
          rating: 5,
          body: `${brand} 이용 후기 본문을 실제 리뷰 문장으로 교체하세요.`,
        },
      ],
    });
    const snippet = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

    const platforms = PLATFORMS.map((p) =>
      p.id === "own-site" ? { ...p, url: `${origin}/reviews` } : p,
    );

    if (!data.verify) {
      return { origin, brand, snippet, platforms, live: null };
    }

    const target = data.verifyUrl?.trim() ? data.verifyUrl.trim() : `${origin}/`;
    const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;

    let status = 0;
    let html = "";
    let finalUrl = url;
    let reachable = false;
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OllimLabBot/1.0; +https://withn.net)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      status = res.status;
      finalUrl = res.url || url;
      reachable = res.ok;
      html = await res.text();
    } catch (e) {
      return {
        origin,
        brand,
        snippet,
        platforms,
        live: {
          reachable: false,
          status,
          finalUrl,
          error: (e as Error).message,
          hasAggregateRating: false,
          hasReview: false,
          ratingValue: null as number | null,
          reviewCount: null as number | null,
        },
      };
    }

    const blocks = [
      ...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi),
    ].map((m) => m[1] ?? "");
    const joined = blocks.join("\n");
    const hasAggregateRating = /"AggregateRating"/i.test(joined);
    const hasReview = /"@type"\s*:\s*"Review"/i.test(joined);
    const ratingMatch = joined.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i);
    const countMatch = joined.match(/"(?:reviewCount|ratingCount)"\s*:\s*"?(\d+)"?/i);

    return {
      origin,
      brand,
      snippet,
      platforms,
      live: {
        reachable,
        status,
        finalUrl,
        error: null as string | null,
        hasAggregateRating,
        hasReview,
        ratingValue: ratingMatch ? Number(ratingMatch[1]) : null,
        reviewCount: countMatch ? Number(countMatch[1]) : null,
      },
    };
  });
