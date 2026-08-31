import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Presentation, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/lib/project-context";
import { ScoreRing } from "@/components/ScoreRing";

export const Route = createFileRoute("/app/reports")({
  head: () => ({
    meta: [
      { title: "종합 리포트 — ollim Lab" },
      { name: "description", content: "SEO·GEO 점수와 AI 언급률 종합 리포트를 문서로 내보냅니다." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsPage,
});

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}


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

  const today = new Date().toLocaleDateString("ko-KR");
  const seo = data?.audit?.seo_score ?? 0;
  const geo = data?.audit?.geo_score ?? 0;
  const summary = data?.audit?.summary ?? "";
  const competitors = Object.entries(competitorCount).sort((a, b) => b[1] - a[1]);

  const exportWord = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>종합 리포트</title></head><body>
      <h1>${project.name} 종합 리포트</h1>
      <p>${today} · ollim Lab - 올림연구소</p>
      <table border="1" cellpadding="6" style="border-collapse:collapse">
        <tr><th>SEO 점수</th><th>GEO 점수</th><th>AI 언급률</th></tr>
        <tr><td>${seo}</td><td>${geo}</td><td>${rate}%</td></tr>
      </table>
      <h2>핵심 개선 요약</h2><p>${(summary || "데이터 없음").replace(/\n/g, "<br/>")}</p>
      <h2>함께 등장한 경쟁사</h2>
      <ul>${competitors.map(([n, c]) => `<li>${n} · ${c}회</li>`).join("") || "<li>데이터 없음</li>"}</ul>
    </body></html>`;
    download(new Blob([html], { type: "application/msword" }), `report-${project.name}.doc`);
    toast.success("Word 파일을 저장했습니다.");
  };

  const exportPptx = async () => {
    try {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();
      const cover = pptx.addSlide();
      cover.addText(`${project.name} SEO·GEO 리포트`, { x: 0.6, y: 2, fontSize: 30, bold: true });
      cover.addText(`${today} · ollim Lab - 올림연구소`, { x: 0.6, y: 3, fontSize: 14 });

      const s1 = pptx.addSlide();
      s1.addText("핵심 지표", { x: 0.5, y: 0.4, fontSize: 24, bold: true });
      s1.addTable(
        [
          [{ text: "항목" }, { text: "값" }],
          [{ text: "SEO 점수" }, { text: String(seo) }],
          [{ text: "GEO 점수" }, { text: String(geo) }],
          [{ text: "AI 언급률" }, { text: `${rate}%` }],
        ],

        { x: 0.5, y: 1.3, w: 8, fontSize: 14, border: { pt: 1, color: "DDDDDD" } },
      );

      const s2 = pptx.addSlide();
      s2.addText("핵심 개선 요약", { x: 0.5, y: 0.4, fontSize: 24, bold: true });
      s2.addText(summary || "데이터 없음", { x: 0.5, y: 1.3, w: 8.5, h: 4, fontSize: 13 });

      const s3 = pptx.addSlide();
      s3.addText("함께 등장한 경쟁사", { x: 0.5, y: 0.4, fontSize: 24, bold: true });
      s3.addText(
        competitors.length ? competitors.map(([n, c]) => `${n} · ${c}회`).join("\n") : "데이터 없음",
        { x: 0.5, y: 1.3, w: 8.5, fontSize: 14 },
      );

      await pptx.writeFile({ fileName: `report-${project.name}.pptx` });
      toast.success("PPTX 파일을 저장했습니다.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">종합 리포트</h1>
          <p className="text-sm text-muted-foreground">
            {project.name} · {today}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> PDF 저장
          </Button>
          <Button variant="outline" size="sm" onClick={exportWord}>
            <FileText className="mr-1 h-4 w-4" /> Word
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportPptx()}>
            <Presentation className="mr-1 h-4 w-4" /> PPTX
          </Button>
        </div>
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
