import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/lib/project-context";

export const Route = createFileRoute("/app/alerts")({
  head: () => ({
    meta: [
      { title: "알림 설정 — GEO Radar" },
      { name: "description", content: "GEO 점수 하락과 LLM 멘션 변화를 이메일로 받아보세요." },
      { property: "og:title", content: "알림 설정 — GEO Radar" },
      { property: "og:description", content: "GEO 점수와 멘션 변화 이메일 알림을 설정합니다." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const { project } = useProjects();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [geoThreshold, setGeoThreshold] = useState(70);
  const [mentionDelta, setMentionDelta] = useState(10);
  const [interval, setIntervalHours] = useState(12);
  const [saving, setSaving] = useState(false);

  const rule = useQuery({
    queryKey: ["alert-rule", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_rules")
        .select("*")
        .eq("project_id", project!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const events = useQuery({
    queryKey: ["alert-events", project?.id],
    enabled: Boolean(project),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_events")
        .select("*")
        .eq("project_id", project!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (rule.data) {
      setEmail(rule.data.email);
      setEnabled(rule.data.enabled);
      setGeoThreshold(rule.data.geo_threshold);
      setMentionDelta(rule.data.mention_delta);
      setIntervalHours(rule.data.min_interval_hours);
    } else if (user?.email) {
      setEmail((prev) => prev || user.email!);
    }
  }, [rule.data, user?.email]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !user) return;
    setSaving(true);
    const { error } = await supabase.from("alert_rules").upsert(
      {
        user_id: user.id,
        project_id: project.id,
        email,
        enabled,
        geo_threshold: geoThreshold,
        mention_delta: mentionDelta,
        min_interval_hours: interval,
      },
      { onConflict: "project_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("알림 설정을 저장했습니다.");
    queryClient.invalidateQueries({ queryKey: ["alert-rule", project.id] });
  }

  if (!project) return <p className="text-sm text-muted-foreground">먼저 프로젝트를 만들어 주세요.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">알림 설정</h1>
        <p className="text-sm text-muted-foreground">
          진단·멘션 체크가 끝날 때마다 조건을 검사해 이메일로 알려드립니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{project.name} 알림 규칙</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">알림 사용</p>
                <p className="text-xs text-muted-foreground">끄면 조건이 충족돼도 발송하지 않습니다.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="a-email">수신 이메일</Label>
              <Input id="a-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="a-geo">GEO 점수 기준 (미만이면 알림)</Label>
                <Input
                  id="a-geo"
                  type="number"
                  min={0}
                  max={100}
                  value={geoThreshold}
                  onChange={(e) => setGeoThreshold(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-delta">멘션률 변화 기준 (%p)</Label>
                <Input
                  id="a-delta"
                  type="number"
                  min={1}
                  max={100}
                  value={mentionDelta}
                  onChange={(e) => setMentionDelta(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-interval">최소 발송 간격 (시간)</Label>
                <Input
                  id="a-interval"
                  type="number"
                  min={1}
                  max={168}
                  value={interval}
                  onChange={(e) => setIntervalHours(Number(e.target.value))}
                />
              </div>
            </div>

            <Button type="submit" disabled={saving}>
              <BellRing className="mr-2 h-4 w-4" /> 설정 저장
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 알림 기록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(events.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">아직 발생한 알림이 없습니다.</p>
          )}
          {(events.data ?? []).map((ev) => (
            <div key={ev.id} className="rounded-lg border border-border px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={ev.kind === "geo_drop" ? "destructive" : "secondary"}>{ev.kind}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(ev.created_at).toLocaleString("ko-KR")}
                </span>
                <Badge variant="outline">{ev.delivered ? "이메일 발송됨" : "앱 내 기록"}</Badge>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{ev.message}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
