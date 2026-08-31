export type PlanId = "free" | "pro" | "business";

export type PlanSpec = {
  id: PlanId;
  label: string;
  price: number; // KRW / month
  audits: number;
  mentions: number;
  /** Monthly AI credits: 리서치·초안·재작성·이미지 생성에 소모 */
  aiCredits: number;
  exports: boolean;
  blurb: string;
  features: string[];
};

export const PLANS: Record<PlanId, PlanSpec> = {
  free: {
    id: "free",
    label: "Free",
    price: 0,
    audits: 5,
    mentions: 5,
    exports: false,
    blurb: "GEO를 처음 점검해 보는 단계",
    features: ["진단 5회/월", "멘션 체크 5회/월", "경쟁사 1곳", "PDF·공유 링크 미포함"],
  },
  pro: {
    id: "pro",
    label: "Pro",
    price: 29000,
    audits: 100,
    mentions: 100,
    exports: true,
    blurb: "한 브랜드를 꾸준히 모니터링",
    features: ["진단 100회/월", "멘션 체크 100회/월", "경쟁사 무제한", "PDF 리포트 + 공유 링크", "이메일 알림"],
  },
  business: {
    id: "business",
    label: "Business",
    price: 99000,
    audits: 2000,
    mentions: 2000,
    exports: true,
    blurb: "여러 브랜드·대행사용",
    features: ["진단 2,000회/월", "멘션 체크 2,000회/월", "경쟁사 무제한", "PDF 리포트 + 공유 링크", "이메일 알림", "사용량 리포트"],
  },
};

export const COMPETITOR_LIMIT: Record<PlanId, number> = {
  free: 1,
  pro: 20,
  business: 100,
};

export function planOf(value: string | null | undefined): PlanId {
  return value === "pro" || value === "business" ? value : "free";
}

export function formatKrw(value: number) {
  return value === 0 ? "무료" : `₩${value.toLocaleString("ko-KR")}/월`;
}
