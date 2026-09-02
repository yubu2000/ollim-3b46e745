import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Clock, Loader2, Plus, Radar, Trash2 } from "lucide-react";
import {
  CartesianGrid,
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/lib/project-context";
import { runAudit } from "@/lib/geo.functions";
import { getProjectsSummary, deleteProject, createProject } from "@/lib/project.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScoreRing } from "@/components/ScoreRing";
import { SearchConsoleCard } from "@/components/SearchConsoleCard";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { project, projects, loading } = useProjects();

  if (loading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (projects.length === 0 || !project) return <CreateProject first />;

  return <ProjectDashboard />;
}

export function CreateProject({ first = false }: { first?: boolean }) {
  const { user } = useAuth();
  const { refetch, selectProject } = useProjects();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [brand, setBrand] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [busy, setBusy] = useState(false);

  const create$ = useServerFn(createProject);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const result = await create$({
        data: {
          name,
          siteUrl: url,
          brandName: brand,
          competitors: competitors
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
        },
      });
      setName("");
      setUrl("");
      setBrand("");
      setCompetitors("");
      refetch();
      if (result?.id) selectProject(result.id);
      toast.success("프로젝트를 만들었습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "프로젝트를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>{first ? "첫 프로젝트를 만들어 주세요" : "새 프로젝트"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={create} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p-name">프로젝트 이름</Label>
            <Input id="p-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="투어더블유 허니문" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-url">사이트 주소</Label>
            <Input id="p-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tourw.co.kr/" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-brand">브랜드명 (AI 답변에서 찾을 이름)</Label>
            <Input id="p-brand" required value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="투어더블유" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-comp">경쟁사 (쉼표로 구분)</Label>
            <Input id="p-comp" value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="하나투어, 모두투어, 참좋은여행" />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            프로젝트 만들기
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AutoAuditCard() {
  const { project } = useProjects();
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ["auto-audit", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("auto_audit_enabled, auto_audit_interval_hours, last_auto_audit_at")
        .eq("id", project!.id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        auto_audit_enabled: boolean;
        auto_audit_interval_hours: number;
        last_auto_audit_at: string | null;
      } | null;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("projects").update(patch as never).eq("id", project!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("자동 진단 설정을 저장했습니다.");
      queryClient.invalidateQueries({ queryKey: ["auto-audit", project?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enabled = settings.data?.auto_audit_enabled ?? true;
  const interval = String(settings.data?.auto_audit_interval_hours ?? 24);
  const last = settings.data?.last_auto_audit_at;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> 자동 진단
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => save.mutate({ auto_audit_enabled: v })}
            aria-label="자동 진단 사용"
          />
          <span className="text-sm">{enabled ? "주기적으로 자동 실행" : "사용 안 함"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">주기</Label>
          <Select value={interval} onValueChange={(v) => save.mutate({ auto_audit_interval_hours: Number(v) })}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6시간</SelectItem>
              <SelectItem value="12">12시간</SelectItem>
              <SelectItem value="24">매일</SelectItem>
              <SelectItem value="72">3일</SelectItem>
              <SelectItem value="168">매주</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          최근 자동 진단:{" "}
          {last ? new Date(last).toLocaleString("ko-KR") : "아직 실행 전"}
        </p>
      </CardContent>
    </Card>
  );
}

function ProjectListCard() {
  const { projects, project, selectProject, refetch } = useProjects();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const summaryFn = useServerFn(getProjectsSummary);
  const removeFn = useServerFn(deleteProject);
  const remove = useMutation({
    mutationFn: (projectId: string) => removeFn({ data: { projectId } }),
    onSuccess: (res: { name: string }) => {
      toast.success(`"${res.name}" 프로젝트를 삭제했습니다.`);
      if (typeof window !== "undefined") localStorage.removeItem("geo:project");
      refetch();
      void queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const summary = useQuery({
    queryKey: ["projects-summary"],
    queryFn: () => summaryFn({ data: undefined }),
  });

  const stat = (pid: string) => summary.data?.projects.find((p: { id: string }) => p.id === pid);
  const limits = summary.data?.limits;
  const usage = summary.data?.usage;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">내 프로젝트 ({projects.length})</CardTitle>
        {limits && usage && (
          <p className="text-xs text-muted-foreground">
            이번 달 계정 한도 · 진단 {usage.audit}/{limits.audit}회 · 멘션 {usage.mention}/{limits.mention}회 · AI{" "}
            {usage.ai}/{limits.ai}크레딧 (남은 진단 {Math.max(0, limits.audit - usage.audit)}회)
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {projects.map((p) => {
          const s = stat(p.id);
          return (
            <div key={p.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                selectProject(p.id);
                navigate({ to: "/app/project/$id", params: { id: p.id } });
              }}
              className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                p.id === project?.id ? "border-primary bg-secondary" : "border-border bg-card hover:bg-secondary"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{p.site_url}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  이번 달 진단 {s?.auditsThisMonth ?? 0}회 · 멘션 {s?.mentionsThisMonth ?? 0}회 · AI{" "}
                  {s?.aiCreditsThisMonth ?? 0}크레딧 · 누적 진단 {s?.auditsTotal ?? 0}회
                </span>
              </span>
              {p.id === project?.id && <Badge variant="secondary">선택됨</Badge>}
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${p.name} 프로젝트 삭제`}
                    disabled={remove.isPending}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    {remove.isPending && remove.variables === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>프로젝트를 삭제할까요?</AlertDialogTitle>
                    <AlertDialogDescription>
                      "{p.name}"의 진단 기록, 멘션 결과, 생성된 콘텐츠, 알림 설정이 모두 삭제되며
                      되돌릴 수 없습니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate(p.id)}>삭제</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ProjectDashboard() {
  const { project } = useProjects();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const audit = useServerFn(runAudit);
  const [targetUrl, setTargetUrl] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const audits = useQuery({
    queryKey: ["audits", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select("*")
        .eq("project_id", project!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const mentions = useQuery({
    queryKey: ["mentions-summary", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mention_runs")
        .select("mentioned, model_label")
        .eq("project_id", project!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const run = useMutation({
    mutationFn: async () =>
      audit({ data: { projectId: project!.id, url: targetUrl || project!.site_url } }),
    onSuccess: (res) => {
      toast.success("진단이 완료되었습니다.");
      queryClient.invalidateQueries({ queryKey: ["audits", project?.id] });
      navigate({ to: "/app/audit/$id", params: { id: res.auditId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const latest = audits.data?.[0];
  const trend = [...(audits.data ?? [])]
    .reverse()
    .map((a) => ({
      date: new Date(a.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
      SEO: a.seo_score,
      GEO: a.geo_score,
    }));

  const total = mentions.data?.length ?? 0;
  const hits = mentions.data?.filter((m) => m.mentioned).length ?? 0;
  const rate = total === 0 ? 0 : Math.round((hits / total) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project?.name}</h1>
          <p className="text-sm text-muted-foreground">{project?.site_url}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" /> 새 프로젝트
        </Button>
      </div>

      {showCreate && <CreateProject />}

      <ProjectListCard />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[240px] flex-1 space-y-2">
            <Label htmlFor="target">진단할 페이지 주소</Label>
            <Input
              id="target"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder={project?.site_url}
            />
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Radar className="mr-2 h-4 w-4" />
            )}
            GEO/SEO 진단 실행
          </Button>
        </CardContent>
      </Card>

      <AutoAuditCard />

      <SearchConsoleCard projectId={project!.id} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">SEO 점수</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRing value={latest?.seo_score ?? 0} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">GEO 점수</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRing value={latest?.geo_score ?? 0} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">AI 언급률</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreRing value={rate} suffix="%" />
            <p className="mt-2 text-xs text-muted-foreground">{total}회 실행 중 {hits}회 언급</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">점수 추이</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">진단을 실행하면 추이가 표시됩니다.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis domain={[0, 100]} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Line type="monotone" dataKey="SEO" stroke="var(--chart-2)" strokeWidth={2} />
                <Line type="monotone" dataKey="GEO" stroke="var(--chart-1)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 진단</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(audits.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">아직 진단 기록이 없습니다.</p>
          )}
          {(audits.data ?? []).map((a) => (
            <Link
              key={a.id}
              to="/app/audit/$id"
              params={{ id: a.id }}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-secondary"
            >
              <span className="truncate pr-3">{a.target_url}</span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary">SEO {a.seo_score}</Badge>
                <Badge>GEO {a.geo_score}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleDateString("ko-KR")}
                </span>
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
