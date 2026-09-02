import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PLANS,
  aiCreditsFor,
  formatPrice,
  priceFor,
  YEARLY_MONTHS_CHARGED,
  type BillingInterval,
  type PlanId,
} from "@/lib/plans";
import { getBilling, startCheckout } from "@/lib/saas.functions";

export const Route = createFileRoute("/app/subscribe")({
  head: () => ({
    meta: [
      { title: "구독 구매 — 올림연구소" },
      {
        name: "description",
        content: "월간·연간 구독 플랜을 비교하고 AI 크레딧 한도를 확인한 뒤 바로 결제하세요.",
      },
      { property: "og:title", content: "구독 구매 — 올림연구소" },
      { property: "og:description", content: "월간·연간 플랜별 AI 크레딧 한도를 비교하고 구독하세요." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SubscribePage,
});

function SubscribePage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const billingFn = useServerFn(getBilling);
  const checkoutFn = useServerFn(startCheckout);

  const billing = useQuery({
    queryKey: ["billing"],
    queryFn: () => billingFn({ data: undefined }),
  });

  const buy = useMutation({
    mutationFn: async (plan: "pro" | "business") =>
      checkoutFn({ data: { plan, interval, origin: window.location.origin } }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = (billing.data?.plan ?? "free") as PlanId;
  const currentInterval = (billing.data?.interval ?? "monthly") as BillingInterval;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">구독 구매</h1>
        <p className="text-sm text-muted-foreground">
          결제 주기에 따라 프로젝트에서 쓸 수 있는 월 AI 크레딧 한도가 달라집니다. 연간 결제는 12개월을{" "}
          {YEARLY_MONTHS_CHARGED}개월 가격에 제공하고, AI 크레딧도 20% 더 드립니다.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border p-1">
          {(["monthly", "yearly"] as BillingInterval[]).map((it) => (
            <Button
              key={it}
              size="sm"
              variant={interval === it ? "default" : "ghost"}
              onClick={() => setInterval(it)}
            >
              {it === "monthly" ? "월간 결제" : "연간 결제"}
            </Button>
          ))}
        </div>
        {interval === "yearly" && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" /> 2개월 무료 + AI 크레딧 +20%
          </Badge>
        )}
      </div>

      {billing.data && !billing.data.stripeReady && (
        <Card className="border-dashed">
          <CardContent className="p-5 text-sm text-muted-foreground">
            결제가 아직 연결되지 않았습니다. 결제 키를 등록하면 구매 버튼이 바로 동작합니다.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.values(PLANS) as (typeof PLANS)[PlanId][]).map((plan) => {
          const isCurrent = plan.id === current && (plan.id === "free" || currentInterval === interval);
          const credits = aiCreditsFor(plan.id, interval);
          const monthlyEquivalent =
            interval === "yearly" && plan.price > 0
              ? Math.round(priceFor(plan.id, "yearly") / 12)
              : plan.price;
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {plan.label}
                  {isCurrent && <Badge variant="secondary">사용 중</Badge>}
                </CardTitle>
                <p className="text-2xl font-bold">{formatPrice(plan.id, interval)}</p>
                {plan.price > 0 && (
                  <p className="text-xs text-muted-foreground">
                    월 환산 ₩{monthlyEquivalent.toLocaleString("ko-KR")} · VAT 별도
                  </p>
                )}
                <p className="text-sm text-muted-foreground">{plan.blurb}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <div className="font-medium">월 AI 크레딧 {credits.toLocaleString("ko-KR")}</div>
                  <p className="text-xs text-muted-foreground">
                    리서치 1 · 최적화 2 · 후속 제안 2 · 글 초안 3 · 이미지 4 크레딧
                  </p>
                </div>
                <ul className="space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.id !== "free" && !isCurrent && (
                  <Button
                    className="w-full"
                    onClick={() => buy.mutate(plan.id as "pro" | "business")}
                    disabled={buy.isPending}
                  >
                    {buy.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {plan.label} {interval === "yearly" ? "연간" : "월간"} 구독하기
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
