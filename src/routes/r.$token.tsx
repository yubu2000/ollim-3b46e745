import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Printer, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/ScoreRing";
import { getSharedReport } from "@/lib/saas.functions";

export const Route = createFileRoute("/r/$token")({
  head: () => ({
    meta: [
      { title: "공유 진단 리포트 — GEO Radar" },
      { name: "description", content: "GEO Radar로 진단한 SEO/GEO 리포트를 공유 링크로 확인합니다." },
      { property: "og:title", content: "공유 진단 리포트 — GEO Radar" },
      { property: "og:description", content: "SEO·GEO 점수와 개선 항목을 담은 공유 리포트입니다." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedReport,
});

function SharedReport() {
  const { token } = Route.useParams();
  const fetchReport = useServerFn(getSharedReport);

  const { data, isLoading } = useQuery({
    queryKey: ["shared-report", token],
    queryFn: () => fetchReport({ data: { token } }),
  });

  if (isLoading) return <p className="p-10 text-sm text-muted-foreground">불러오는 중…</p>;
  if (!data || !data.ok)
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-xl font-bold">리포트를 볼 수 없습니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {(data && "reason" in data && data.reason) || "잘못된 링크입니다."}
        </p>
      </div>
    );

  const geo = data.items.filter((i) => i.category === "GEO");
  const seo = data.items.filter((i) => i.category === "SEO");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{data.projectName} 진단 리포트</h1>
          <p className="break-all text-sm text-muted-foreground">
            {data.audit.target_url} · {new Date(data.audit.created_at).toLocaleDateString("ko-KR")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> PDF 저장
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">SEO 점수</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRing value={data.audit.seo_score} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">GEO 점수</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRing value={data.audit.geo_score} />
          </CardContent>
        </Card>
      </div>

      {data.audit.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">핵심 개선 요약</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.audit.summary}</p>
          </CardContent>
        </Card>
      )}

      <SharedList title="GEO 항목" items={geo} />
      <SharedList title="SEO 항목" items={seo} />
    </div>
  );
}

type SharedItem = {
  category: string;
  title: string;
  passed: boolean;
  severity: string;
  evidence: string | null;
  recommendation: string | null;
};

function SharedList({ title, items }: { title: string; items: SharedItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((i) => (
          <div key={`${i.category}-${i.title}`} className="rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              {i.passed ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--chart-2)]" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{i.title}</span>
                  {!i.passed && (
                    <Badge variant={i.severity === "high" ? "destructive" : "secondary"}>
                      {i.severity === "high" ? "높음" : i.severity === "medium" ? "보통" : "낮음"}
                    </Badge>
                  )}
                </div>
                {i.evidence && <p className="mt-1 break-words text-xs text-muted-foreground">{i.evidence}</p>}
                {!i.passed && i.recommendation && <p className="mt-2 text-sm">{i.recommendation}</p>}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
