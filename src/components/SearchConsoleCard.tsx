import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { listGscProperties, refreshGscSnapshot, saveGscProperty } from "@/lib/insights.functions";

type QueryRow = { query: string; clicks: number; impressions: number; ctr: number; position: number };

export function SearchConsoleCard({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listGscProperties);
  const saveFn = useServerFn(saveGscProperty);
  const refreshFn = useServerFn(refreshGscSnapshot);

  const properties = useQuery({
    queryKey: ["gsc-properties", projectId],
    queryFn: () => listFn({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });

  const project = useQuery({
    queryKey: ["gsc-project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("gsc_site_url")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const snapshot = useQuery({
    queryKey: ["gsc-snapshot", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("search_console_snapshots")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (siteUrl: string) => saveFn({ data: { projectId, siteUrl } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gsc-project", projectId] });
      toast.success("Search Console 속성을 저장했습니다.");
      refresh.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refresh = useMutation({
    mutationFn: async () => refreshFn({ data: { projectId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gsc-snapshot", projectId] });
      toast.success("Search Console 지표를 새로 가져왔습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = properties.data
    ? properties.data.matches.length > 0
      ? properties.data.matches
      : properties.data.all
    : [];
  const selected = project.data?.gsc_site_url ?? undefined;
  const rows = (snapshot.data?.top_queries ?? []) as QueryRow[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> 구글 Search Console SEO 지표
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            최근 28일 실제 검색 데이터 · 자동 진단 시 함께 갱신됩니다.
          </p>
        </div>
        {selected && (
          <Button variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            지금 갱신
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {properties.isLoading && <p className="text-sm text-muted-foreground">속성을 불러오는 중…</p>}
        {properties.data?.configured === false && (
          <p className="text-sm text-muted-foreground">
            Search Console 연결이 아직 설정되지 않았습니다.
          </p>
        )}
        {properties.isError && (
          <p className="text-sm text-destructive">{(properties.error as Error).message}</p>
        )}

        {options.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">연결할 속성</p>
            <Select value={selected} onValueChange={(v) => save.mutate(v)}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Search Console 속성을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {properties.data?.configured && options.length === 0 && (
          <p className="text-sm text-muted-foreground">
            연결된 Google 계정에 인증된 속성이 없습니다. Search Console에서 사이트를 먼저 인증해 주세요.
          </p>
        )}

        {snapshot.data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "클릭", value: snapshot.data.clicks.toLocaleString("ko-KR") },
                { label: "노출", value: snapshot.data.impressions.toLocaleString("ko-KR") },
                { label: "CTR", value: `${snapshot.data.ctr}%` },
                { label: "평균 순위", value: `${snapshot.data.position}위` },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-semibold">{m.value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {snapshot.data.period_start} ~ {snapshot.data.period_end} 기준 · 갱신{" "}
              {new Date(snapshot.data.fetched_at).toLocaleString("ko-KR")}
            </p>

            {rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">검색어</th>
                      <th className="py-2 pr-3">노출</th>
                      <th className="py-2 pr-3">클릭</th>
                      <th className="py-2 pr-3">CTR</th>
                      <th className="py-2">평균 순위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((r) => (
                      <tr key={r.query} className="border-b border-border/60">
                        <td className="py-2 pr-3 font-medium">{r.query}</td>
                        <td className="py-2 pr-3">{r.impressions.toLocaleString("ko-KR")}</td>
                        <td className="py-2 pr-3">{r.clicks.toLocaleString("ko-KR")}</td>
                        <td className="py-2 pr-3">{r.ctr}%</td>
                        <td className="py-2">{r.position}위</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
