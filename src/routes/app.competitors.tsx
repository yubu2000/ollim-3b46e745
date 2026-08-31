import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Swords, Trash2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/lib/project-context";
import { runCompetitorCompare } from "@/lib/saas.functions";

export const Route = createFileRoute("/app/competitors")({
  head: () => ({
    meta: [
      { title: "경쟁사 비교 — GEO Radar" },
      { name: "description", content: "내 사이트와 경쟁사의 SEO/GEO 점수와 LLM 멘션 추세를 나란히 비교합니다." },
      { property: "og:title", content: "경쟁사 비교 — GEO Radar" },
      { property: "og:description", content: "경쟁사 대비 GEO 경쟁력을 한 화면에서 확인하세요." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CompetitorsPage,
});

type CheckRow = { category: string; title: string; passed: boolean };

function CompetitorsPage() {
  const { project } = useProjects();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const compare = useServerFn(runCompetitorCompare);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const sites = useQuery({
    queryKey: ["competitor-sites", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_sites")
        .select("*")
        .eq("project_id", project!.id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const audits = useQuery({
    queryKey: ["competitor-audits", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_audits")
        .select("*")
        .eq("project_id", project!.id)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const mentions = useQuery({
    queryKey: ["competitor-mentions", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mention_runs")
        .select("mentioned, competitors, created_at")
        .eq("project_id", project!.id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const run = useMutation({
    mutationFn: async () => compare({ data: { projectId: project!.id } }),
    onSuccess: (res) => {
      toast.success(`${res.compared}개 사이트를 비교했습니다.`);
      queryClient.invalidateQueries({ queryKey: ["competitor-audits", project?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function addSite(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !user) return;
    const { error } = await supabase.from("competitor_sites").insert({
      user_id: user.id,
      project_id: project.id,
      name,
      url,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setUrl("");
    queryClient.invalidateQueries({ queryKey: ["competitor-sites", project.id] });
  }

  async function removeSite(id: string) {
    await supabase.from("competitor_sites").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["competitor-sites", project?.id] });
  }

  if (!project) return <p className="text-sm text-muted-foreground">먼저 프로젝트를 만들어 주세요.</p>;

  // latest audit per label
  type AuditRow = {
    id: string;
    label: string;
    is_self: boolean;
    seo_score: number;
    geo_score: number;
    items: unknown;
    metrics?: unknown;
  };
  const latest = new Map<string, AuditRow>();
  for (const row of (audits.data ?? []) as AuditRow[])
    if (!latest.has(row.label)) latest.set(row.label, row);
  const rows = [...latest.values()].sort((a, b) => Number(b.is_self) - Number(a.is_self));


  const scoreData = rows.map((r) => ({ name: r.label, SEO: r.seo_score, GEO: r.geo_score }));

  type KeywordStat = { term: string; count: number; density: number; inTitle: boolean };
  type Metrics = {
    chars?: number;
    words?: number;
    paragraphs?: number;
    headings?: number;
    images?: number;
    internalLinks?: number;
    externalLinks?: number;
    totalLinks?: number;
    linksPer1000Words?: number;
    jsonLdBlocks?: number;
    keywords?: KeywordStat[];
  };
  const metricRows = rows.map((r) => ({ row: r, m: (r.metrics ?? {}) as Metrics }));
  const hasMetrics = metricRows.some((x) => typeof x.m.chars === "number");
  const metricDefs: { key: keyof Metrics; label: string; suffix?: string }[] = [
    { key: "chars", label: "콘텐츠 길이", suffix: "자" },
    { key: "words", label: "단어 수", suffix: "개" },
    { key: "paragraphs", label: "문단 수", suffix: "개" },
    { key: "headings", label: "제목 태그 수", suffix: "개" },
    { key: "internalLinks", label: "내부 링크", suffix: "개" },
    { key: "externalLinks", label: "외부 링크", suffix: "개" },
    { key: "totalLinks", label: "전체 링크", suffix: "개" },
    { key: "linksPer1000Words", label: "링크 빈도(1,000단어당)", suffix: "개" },
    { key: "images", label: "이미지 수", suffix: "개" },
    { key: "jsonLdBlocks", label: "구조화 데이터 블록", suffix: "개" },
  ];


  const checkTitles = [
    ...new Set(
      rows.flatMap((r) => ((r.items as unknown as CheckRow[]) ?? []).map((i) => `${i.category}|${i.title}`)),
    ),
  ];

  const brandNames = [project.brand_name, ...(sites.data ?? []).map((s) => s.name)];
  const byDay = new Map<string, Record<string, { hit: number; total: number }>>();
  for (const m of mentions.data ?? []) {
    const day = new Date(m.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    const bucket = byDay.get(day) ?? {};
    for (const brand of brandNames) {
      const stat = bucket[brand] ?? { hit: 0, total: 0 };
      stat.total += 1;
      const found =
        brand === project.brand_name
          ? m.mentioned
          : Array.isArray(m.competitors) && (m.competitors as string[]).includes(brand);
      if (found) stat.hit += 1;
      bucket[brand] = stat;
    }
    byDay.set(day, bucket);
  }
  const trend = [...byDay.entries()].map(([day, bucket]) => {
    const point: Record<string, string | number> = { date: day };
    for (const brand of brandNames) {
      const stat = bucket[brand];
      point[brand] = stat && stat.total > 0 ? Math.round((stat.hit / stat.total) * 100) : 0;
    }
    return point;
  });
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">경쟁사 비교</h1>
          <p className="text-sm text-muted-foreground">
            내 사이트와 경쟁사의 SEO/GEO 지표, LLM 멘션 추세를 나란히 확인합니다.
          </p>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2 h-4 w-4" />}
          비교 진단 실행
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">경쟁사 도메인</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addSite} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[160px] flex-1 space-y-2">
              <Label htmlFor="c-name">경쟁사 이름</Label>
              <Input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="하나투어" />
            </div>
            <div className="min-w-[220px] flex-[2] space-y-2">
              <Label htmlFor="c-url">도메인 주소</Label>
              <Input id="c-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.hanatour.com" />
            </div>
            <Button type="submit" variant="outline">추가</Button>
          </form>

          <div className="space-y-2">
            {(sites.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">아직 등록된 경쟁사가 없습니다.</p>
            )}
            {(sites.data ?? []).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2 text-sm">
                <span className="truncate">
                  <strong>{s.name}</strong> <span className="text-muted-foreground">{s.url}</span>
                </span>
                <Button variant="ghost" size="icon" onClick={() => void removeSite(s.id)} aria-label="삭제">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SEO / GEO 점수 비교</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {scoreData.length === 0 ? (
            <p className="text-sm text-muted-foreground">비교 진단을 실행하면 결과가 표시됩니다.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis domain={[0, 100]} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Legend />
                <Bar dataKey="SEO" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="GEO" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {checkTitles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">항목별 비교</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">점검 항목</th>
                  {rows.map((r) => (
                    <th key={r.id} className="px-2 py-2 font-medium">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checkTitles.map((key) => {
                  const [category, title] = key.split("|");
                  const cells = rows.map((r) => {
                    const found = ((r.items as unknown as CheckRow[]) ?? []).find(
                      (i) => i.category === category && i.title === title,
                    );
                    return { id: r.id, self: r.is_self, passed: found?.passed ?? null };
                  });
                  const self = cells.find((c) => c.self);
                  const losing = self?.passed === false && cells.some((c) => !c.self && c.passed === true);
                  return (
                    <tr key={key} className={`border-b border-border/60 ${losing ? "bg-destructive/5" : ""}`}>
                      <td className="py-2 pr-4">
                        <Badge variant="secondary" className="mr-2">{category}</Badge>
                        {title}
                      </td>
                      {cells.map((c) => (
                        <td key={c.id} className="px-2 py-2">
                          {c.passed === null ? "—" : c.passed ? "✅" : "❌"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LLM 멘션 추세 (언급률 %)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">멘션 체크를 실행하면 추세가 표시됩니다.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis domain={[0, 100]} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Legend />
                {brandNames.map((brand, idx) => (
                  <Line
                    key={brand}
                    type="monotone"
                    dataKey={brand}
                    stroke={palette[idx % palette.length]}
                    strokeWidth={idx === 0 ? 3 : 2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
