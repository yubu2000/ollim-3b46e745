import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "@tanstack/react-router";
import { PLANS, formatKrw, type BillingInterval, type PlanId } from "@/lib/plans";
import { getBilling, openBillingPortal } from "@/lib/saas.functions";

export const Route = createFileRoute("/app/billing")({
  head: () => ({
    meta: [
      { title: "요금제 — GEO Radar" },
      { name: "description", content: "GEO Radar 플랜별 진단·모니터링 한도와 사용량을 관리합니다." },
      { property: "og:title", content: "요금제 — GEO Radar" },
      { property: "og:description", content: "플랜별 진단 한도와 리포트 권한을 관리하세요." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const billingFn = useServerFn(getBilling);
  const portal = useServerFn(openBillingPortal);

  const billing = useQuery({
    queryKey: ["billing"],
    queryFn: () => billingFn({ data: undefined }),
  });

  const manage = useMutation({
    mutationFn: async () => portal({ data: { origin: window.location.origin } }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = (billing.data?.plan ?? "free") as PlanId;
  const usage = billing.data?.usage ?? { audit: 0, mention: 0, ai: 0 };
  const limits = billing.data?.limits ?? {
    audit: PLANS.free.audits,
    mention: PLANS.free.mentions,
    ai: PLANS.free.aiCredits,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">요금제 &amp; 사용량</h1>
        <p className="text-sm text-muted-foreground">
          플랜에 따라 진단·멘션 체크 횟수와 리포트 다운로드 권한이 달라집니다.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            현재 플랜 <Badge className="ml-2">{PLANS[current].label}</Badge>
            {current !== "free" && (
              <Badge variant="outline" className="ml-2">
                {((billing.data?.interval ?? "monthly") as BillingInterval) === "yearly" ? "연간 결제" : "월간 결제"}
              </Badge>
            )}
          </CardTitle>
          {current !== "free" && (
            <Button variant="outline" size="sm" onClick={() => manage.mutate()} disabled={manage.isPending}>
              <CreditCard className="mr-1 h-4 w-4" /> 결제 관리
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <UsageBar label="이번 달 진단" used={usage.audit} limit={limits.audit} />
            <UsageBar label="이번 달 멘션 체크" used={usage.mention} limit={limits.mention} />
          </div>
          <UsageBar label="이번 달 AI 크레딧" used={usage.ai} limit={limits.ai} unit="크레딧" />
          <p className="text-xs text-muted-foreground">
            AI 크레딧 소모: 키워드 리서치 1 · 콘텐츠 최적화 2 · 후속 제안 2 · 글 초안 3 · 이미지 생성 4
          </p>
        </CardContent>
      </Card>

      {billing.data && !billing.data.stripeReady && (
        <Card className="border-dashed">
          <CardContent className="p-5 text-sm text-muted-foreground">
            결제가 아직 연결되지 않았습니다. Stripe 비밀 키를 등록하면 아래 업그레이드 버튼이 바로 동작합니다.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.values(PLANS) as (typeof PLANS)[PlanId][]).map((plan) => (
          <Card key={plan.id} className={plan.id === current ? "border-primary" : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                {plan.label}
                {plan.id === current && <Badge variant="secondary">사용 중</Badge>}
              </CardTitle>
              <p className="text-2xl font-bold">{formatKrw(plan.price)}</p>
              <p className="text-sm text-muted-foreground">{plan.blurb}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.id !== "free" && plan.id !== current && (
                <Button className="w-full" asChild>
                  <Link to="/app/subscribe">{plan.label}로 업그레이드</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
  unit = "회",
}: {
  label: string;
  used: number;
  limit: number;
  unit?: string;
}) {
  const pct = limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {used} / {limit}
          {unit}
        </span>
      </div>
      <Progress value={pct} />
    </div>
  );
}
