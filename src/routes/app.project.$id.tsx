import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Copy, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProjectOverview, getTrustTags } from "@/lib/project.functions";

export const Route = createFileRoute("/app/project/$id")({
  component: ProjectDetail,
  head: () => ({
    meta: [
      { title: "프로젝트 상세 · ollim Lab" },
      { name: "description", content: "프로젝트별 진단 기록, 사용량, AI 크레딧 사용 내역과 신뢰 태그 검증을 확인합니다." },
      { property: "og:title", content: "프로젝트 상세 · ollim Lab" },
      { property: "og:description", content: "진단 기록과 AI 크레딧 사용 내역을 한눈에 확인하세요." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ACTION_LABEL: Record<string, string> = {
  research: "키워드 리서치",
  optimize: "콘텐츠 최적화",
  article: "글 초안 생성",
  image: "이미지 생성",
  suggestions: "후속 콘텐츠 제안",
  ai: "AI 작업",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("ko-KR");
}

function UsageBar({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {used} / {total} (남은 {Math.max(0, total - used)})
        </span>
      </div>
      <Progress value={pct} />
    </div>
  );
}

function ProjectDetail() {
  const { id } = Route.useParams();
  const overviewFn = useServerFn(getProjectOverview);
  const trustFn = useServerFn(getTrustTags);

  const overview = useQuery({
    queryKey: ["project-overview", id],
    queryFn: () => overviewFn({ data: { projectId: id } }),
  });

  const trust = useQuery({
    queryKey: ["trust-tags", id],
    queryFn: () => trustFn({ data: { projectId: id, verify: false } }),
  });

  const verify = useMutation({
    mutationFn: () => trustFn({ data: { projectId: id, verify: true } }),
    onSuccess: (r) => {
      if (r.live?.organizationOk && r.live?.canonicalOk) toast.success("Organization JSON-LD와 canonical이 확인되었습니다.");
      else toast.warning("사이트에서 태그를 찾지 못했습니다. 아래 코드를 <head>에 넣어주세요.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const live = verify.data?.live ?? null;
  const d = overview.data;

  if (overview.isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }
  if (!d) return <div className="p-8 text-muted-foreground">프로젝트를 찾을 수 없습니다.</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app">
            <ArrowLeft className="mr-1 h-4 w-4" /> 대시보드
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{d.project.name}</h1>
          <p className="text-sm text-muted-foreground">{d.project.site_url}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "누적 진단", value: `${d.counts.auditsTotal}회` },
          { label: "이번 달 진단", value: `${d.counts.auditsThisMonth}회` },
          { label: "이번 달 멘션 체크", value: `${d.counts.mentionsThisMonth}회` },
          { label: "이번 달 AI 크레딧", value: `${d.counts.aiCreditsThisMonth}` },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">진단 기록</TabsTrigger>
          <TabsTrigger value="usage">사용량 · 한도</TabsTrigger>
          <TabsTrigger value="credits">AI 크레딧 내역</TabsTrigger>
          <TabsTrigger value="trust">신뢰 태그</TabsTrigger>
          <TabsTrigger value="reviews">평점 · 리뷰</TabsTrigger>
        </TabsList>


        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">진단 기록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.audits.length === 0 && <p className="text-sm text-muted-foreground">아직 진단 기록이 없습니다.</p>}
              {d.audits.map((a) => (
                <Link
                  key={a.id}
                  to="/app/audit/$id"
                  params={{ id: a.id }}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm hover:bg-secondary"
                >
                  <span className="min-w-0 flex-1 truncate pr-3">
                    <span className="font-medium">{a.target_url}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{fmt(a.created_at)}</span>
                  </span>
                  <span className="flex gap-2">
                    <Badge variant="secondary">SEO {a.seo_score}</Badge>
                    <Badge variant="secondary">GEO {a.geo_score}</Badge>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{d.period} 계정 사용량</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <UsageBar label="진단" used={d.usage.audit} total={d.limits.audit} />
              <UsageBar label="멘션 체크" used={d.usage.mention} total={d.limits.mention} />
              <UsageBar label="AI 크레딧" used={d.usage.ai} total={d.limits.ai} />
              <p className="text-xs text-muted-foreground">
                한도는 계정 전체 기준이며 매월 1일(UTC)에 초기화됩니다. 이 프로젝트가 사용한 몫: 진단{" "}
                {d.counts.auditsThisMonth}회 · 멘션 {d.counts.mentionsThisMonth}회 · AI {d.counts.aiCreditsThisMonth}크레딧
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credits" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">AI 크레딧 사용 내역</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.aiEvents.length === 0 && (
                <p className="text-sm text-muted-foreground">이 프로젝트에서 사용한 AI 작업 내역이 아직 없습니다.</p>
              )}
              {d.aiEvents.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate pr-3">
                    <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
                    {e.detail && <span className="ml-2 text-xs text-muted-foreground">{e.detail}</span>}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    {fmt(e.created_at)}
                    <Badge variant="secondary">-{e.credits}</Badge>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trust" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> Organization JSON-LD · canonical
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                아래 코드를 {trust.data?.origin} 홈페이지 <code>&lt;head&gt;</code>에 넣으면 검색엔진과 AI 검색이 브랜드를 신뢰
                가능한 발행처로 인식합니다.
              </p>
              <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-4 text-xs">{trust.data?.snippet}</pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(trust.data?.snippet ?? "");
                    toast.success("코드를 복사했습니다.");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> 코드 복사
                </Button>
                <Button size="sm" onClick={() => verify.mutate()} disabled={verify.isPending}>
                  {verify.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  실제 사이트에서 검증
                </Button>
              </div>

              {live && (
                <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
                  <div className="flex items-center gap-2">
                    {live.canonicalOk ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    canonical {live.canonical ? `→ ${live.canonical}` : "미검출"}
                  </div>
                  <div className="flex items-center gap-2">
                    {live.organizationOk ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    Organization JSON-LD {live.jsonldTypes.length > 0 ? `(검출: ${live.jsonldTypes.join(", ")})` : "미검출"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    HTTP {live.status} · {live.finalUrl}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <ReviewSignalsCard projectId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );

}
