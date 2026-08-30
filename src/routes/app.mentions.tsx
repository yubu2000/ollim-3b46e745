import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, Loader2, Plus, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/lib/project-context";
import { runMentionCheck } from "@/lib/geo.functions";

export const Route = createFileRoute("/app/mentions")({
  component: MentionsPage,
});

function MentionsPage() {
  const { project } = useProjects();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const check = useServerFn(runMentionCheck);
  const [q, setQ] = useState("");

  const prompts = useQuery({
    queryKey: ["prompts", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prompts")
        .select("*")
        .eq("project_id", project!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const runs = useQuery({
    queryKey: ["mention_runs", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mention_runs")
        .select("*, prompts(text)")
        .eq("project_id", project!.id)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const runCheck = useMutation({
    mutationFn: async () => check({ data: { projectId: project!.id } }),
    onSuccess: () => {
      toast.success("AI 언급 점검이 끝났습니다.");
      queryClient.invalidateQueries({ queryKey: ["mention_runs", project?.id] });
      queryClient.invalidateQueries({ queryKey: ["mentions-summary", project?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!project) return <p className="text-sm text-muted-foreground">먼저 프로젝트를 만들어 주세요.</p>;

  async function addPrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !q.trim()) return;
    const { error } = await supabase
      .from("prompts")
      .insert({ user_id: user.id, project_id: project!.id, text: q.trim() });
    if (error) {
      toast.error(error.message);
      return;
    }
    setQ("");
    queryClient.invalidateQueries({ queryKey: ["prompts", project?.id] });
  }

  async function removePrompt(id: string) {
    await supabase.from("prompts").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["prompts", project?.id] });
  }

  const byModel = Object.values(
    (runs.data ?? []).reduce<Record<string, { model: string; 언급: number; 전체: number }>>(
      (acc, r) => {
        const key = r.model_label as string;
        acc[key] ??= { model: key, 언급: 0, 전체: 0 };
        acc[key].전체 += 1;
        if (r.mentioned) acc[key].언급 += 1;
        return acc;
      },
      {},
    ),
  ).map((m) => ({ ...m, 언급률: Math.round((m.언급 / m.전체) * 100) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LLM 언급 추적</h1>
          <p className="text-sm text-muted-foreground">
            같은 질문을 여러 AI 모델에 보내 <strong>{project.brand_name}</strong> 가 답변에 등장하는지 확인합니다.
          </p>
        </div>
        <Button onClick={() => runCheck.mutate()} disabled={runCheck.isPending || (prompts.data ?? []).length === 0}>
          {runCheck.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
          지금 점검 실행
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">추적 질문</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={addPrompt} className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="예: 하와이 허니문 패키지 추천해줘"
            />
            <Button type="submit" variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </form>
          {(prompts.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              고객이 AI에게 물어볼 법한 질문을 등록하세요.
            </p>
          )}
          {(prompts.data ?? []).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-2 text-sm"
            >
              <span>{p.text}</span>
              <Button variant="ghost" size="icon" onClick={() => void removePrompt(p.id)} aria-label="삭제">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {byModel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">모델별 언급률</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byModel}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="model" fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis domain={[0, 100]} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar dataKey="언급률" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 결과</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(runs.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">아직 점검 기록이 없습니다.</p>
          )}
          {(runs.data ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{r.model_label}</Badge>
                {r.mentioned ? (
                  <Badge>언급됨{r.rank ? ` · ${r.rank}번째` : ""}</Badge>
                ) : (
                  <Badge variant="outline">미언급</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="mt-2 font-medium">{r.prompts?.text}</p>
              {r.excerpt && <p className="mt-1 text-muted-foreground">{r.excerpt}</p>}
              {Array.isArray(r.competitors) && r.competitors.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  함께 언급된 경쟁사: {(r.competitors as string[]).join(", ")}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
