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
    aiCredits: 20,
    exports: false,
    blurb: "GEO를 처음 점검해 보는 단계",
    features: ["진단 5회/월", "멘션 체크 5회/월", "AI 크레딧 20/월", "경쟁사 1곳", "PDF·공유 링크 미포함"],
  },
  pro: {
    id: "pro",
    label: "Pro",
    price: 99000,
    audits: 100,
    mentions: 100,
    aiCredits: 200,
    exports: true,
    blurb: "한 브랜드를 꾸준히 모니터링",
    features: ["진단 100회/월", "멘션 체크 100회/월", "AI 크레딧 200/월", "프로젝트3개 생성", "PDF 리포트 + 공유 링크", "1개의 워드프레스 등록"],
  },
  business: {
    id: "business",
    label: "Business",
    price: 297000,
    audits: 1000,
    mentions: 1000,
    aiCredits: 2000,
    exports: true,
    blurb: "여러 브랜드 모니터링",
    features: ["진단 1,000회/월", "멘션 체크 1,000회/월", "AI 크레딧 2,000/월", "프로젝트 10개 생성", "PDF 리포트 + 공유 링크", "5개의 워드프레스 등록", "사용량 리포트"],
  },
};

/** 등록 가능한 프로젝트 수 (Free는 1개). */
export const PROJECT_LIMIT: Record<PlanId, number> = {
  free: 1,
  pro: 20,
  business: 200,
};

export const COMPETITOR_LIMIT: Record<PlanId, number> = {
  free: 1,
  pro: 20,
  business: 100,
};

export type BillingInterval = "monthly" | "yearly";

/** 연간 결제는 12개월분을 10개월 가격에 제공합니다. */
export const YEARLY_MONTHS_CHARGED = 10;

/** 연간 결제 시 월 AI 크레딧 보너스 (+20%). */
export const YEARLY_AI_BONUS = 0.2;

export function intervalOf(value: string | null | undefined): BillingInterval {
  return value === "yearly" ? "yearly" : "monthly";
}

/** 해당 플랜·주기의 실제 결제 금액 (KRW). */
export function priceFor(plan: PlanId, interval: BillingInterval) {
  const monthly = PLANS[plan].price;
  return interval === "yearly" ? monthly * YEARLY_MONTHS_CHARGED : monthly;
}

/** 해당 플랜·주기의 월 AI 크레딧 한도. 연간 결제는 20% 더 많습니다. */
export function aiCreditsFor(plan: PlanId, interval: BillingInterval) {
  const base = PLANS[plan].aiCredits;
  if (interval !== "yearly" || base === 0) return base;
  return Math.round(base * (1 + YEARLY_AI_BONUS));
}

export function formatPrice(plan: PlanId, interval: BillingInterval) {
  const amount = priceFor(plan, interval);
  if (amount === 0) return "무료";
  return interval === "yearly"
    ? `₩${amount.toLocaleString("ko-KR")}/년`
    : `₩${amount.toLocaleString("ko-KR")}/월`;
}

export function planOf(value: string | null | undefined): PlanId {
  return value === "pro" || value === "business" ? value : "free";
}

export function formatKrw(value: number) {
  return value === 0 ? "무료" : `₩${value.toLocaleString("ko-KR")}/월`;
}

/** AI 크레딧 소모량 (한 번 실행당). 토큰 비용이 큰 작업일수록 높습니다. */
export const AI_COST = {
  research: 1,
  optimize: 2,
  article: 3,
  image: 4,
  suggestions: 2,
} as const;
export type AiAction = keyof typeof AI_COST;
