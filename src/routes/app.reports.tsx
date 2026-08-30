import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/lib/project-context";
import { ScoreRing } from "@/components/ScoreRing";

export const Route = createFileRoute("/app/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { project } = useProjects();

  const { data } = useQuery({
    queryKey: ["report", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const [audits, runs] = await Promise.all([
        supabase
          .from("audits")
          .select("*")
          .eq("project_id", project!.id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase.from("mention_runs").select("*, prompts(text)").eq("project_id", project!.id),
      ]);
      if (audits.error) throw audits.error;
      if (runs.error) throw runs.error;
      return { audit: audits.data?.[0] ?? null, runs: runs.data ?? [] };
    },
  });

  if (!project) return <p className="text-sm text-muted-foreground">먼저 프로젝트를 만들어 주세요.</p>;

  const runs = data?.runs ?? [];
  const rate = runs.length === 0 ? 0 : Math.round((runs.filter((r) => r.mentioned).length / runs.length) * 100);

  const competitorCount = runs
    .flatMap((r) => (Array.isArray(r.competitors) ? (r.competitors as string[]) : []))
    .reduce<Record<string, number>>((acc, c) => {
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">종합 리포트</h1>
          <p className="text-sm text-muted-foreground">
            {project.name} · {new Date().toLocaleDateString("ko-KR")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> 인쇄 / PDF 저장
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">SEO 점수</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRing value={data?.audit?.seo_score ?? 0} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">GEO 점수</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRing value={data?.audit?.geo_score ?? 0} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">AI 언급률</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRing value={rate} suffix="%" />
          </CardContent>
        </Card>
      </div>

      {data?.audit?.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">핵심 개선 요약</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.audit.summary}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI 답변에서 함께 등장한 경쟁사</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.keys(competitorCount).length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 데이터가 없습니다.</p>
          ) : (
            Object.entries(competitorCount)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <Badge key={name} variant="secondary">
                  {name} · {count}회
                </Badge>
              ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
