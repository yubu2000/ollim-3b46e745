import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Copy, Link2, Loader2, Printer, Wrench, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ScoreRing } from "@/components/ScoreRing";
import { createShareLink, revokeShareLink, getBilling } from "@/lib/saas.functions";
import { KeywordSuggestionsCard } from "@/components/KeywordSuggestions";
import { FIX_GUIDES } from "@/lib/fix-guides";

export const Route = createFileRoute("/app/audit/$id")({
  component: AuditDetail,
});


type Item = {
  id: string;
  category: string;
  title: string;
  passed: boolean;
  severity: string;
  evidence: string | null;
  recommendation: string | null;
};

function AuditDetail() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["audit", id],
    queryFn: async () => {
      const [audit, items] = await Promise.all([
        supabase.from("audits").select("*").eq("id", id).single(),
        supabase.from("audit_items").select("*").eq("audit_id", id),
      ]);
      if (audit.error) throw audit.error;
      if (items.error) throw items.error;
      return { audit: audit.data, items: (items.data ?? []) as Item[] };
    },
  });

  const queryClient = useQueryClient();
  const billingFn = useServerFn(getBilling);
  const billing = useQuery({ queryKey: ["billing"], queryFn: () => billingFn({ data: undefined }) });
  const canExport = billing.data?.exports ?? false;
  const share = useServerFn(createShareLink);
  const revoke = useServerFn(revokeShareLink);

  const links = useQuery({
    queryKey: ["share-links", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shared_reports")
        .select("*")
        .eq("audit_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createLink = useMutation({
    mutationFn: async () => share({ data: { auditId: id, days: 30 } }),
    onSuccess: () => {
      toast.success("공유 링크를 만들었습니다. (30일 유효)");
      queryClient.invalidateQueries({ queryKey: ["share-links", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeLink = useMutation({
    mutationFn: async (linkId: string) => revoke({ data: { id: linkId } }),
    onSuccess: () => {
      toast.success("공유 링크를 해제했습니다.");
      queryClient.invalidateQueries({ queryKey: ["share-links", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">진단을 찾을 수 없습니다.</p>;

  const seo = data.items.filter((i) => i.category === "SEO");
  const geo = data.items.filter((i) => i.category === "GEO");

  return (
    <div className="space-y-6">
      <Link to="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 대시보드
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">진단 리포트</h1>
          <p className="break-all text-sm text-muted-foreground">{data.audit.target_url}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              canExport
                ? window.print()
                : toast.error("PDF 내보내기와 공유 링크는 Pro 플랜부터 사용할 수 있습니다.")
            }
          >
            <Printer className="mr-1 h-4 w-4" /> PDF 저장
          </Button>
          <Button size="sm" onClick={() => createLink.mutate()} disabled={createLink.isPending}>
            {createLink.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-1 h-4 w-4" />
            )}
            공유 링크 생성
          </Button>
        </div>
      </div>

      {(links.data ?? []).length > 0 && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="text-base">공유 링크</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(links.data ?? []).map((l) => {
              const url = `${typeof window === "undefined" ? "" : window.location.origin}/r/${l.token}`;
              return (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{url}</span>
                  <span className="flex items-center gap-2">
                    {l.revoked ? (
                      <Badge variant="secondary">해제됨</Badge>
                    ) : (
                      <Badge>
                        {l.expires_at
                          ? `${new Date(l.expires_at).toLocaleDateString("ko-KR")}까지`
                          : "무기한"}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="링크 복사"
                      onClick={() => {
                        void navigator.clipboard.writeText(url);
                        toast.success("링크를 복사했습니다.");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {!l.revoked && (
                      <Button variant="outline" size="sm" onClick={() => revokeLink.mutate(l.id)}>
                        해제
                      </Button>
                    )}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}



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
            <CardTitle className="text-base">AI 요약 및 우선 개선안</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.audit.summary}</p>
          </CardContent>
        </Card>
      )}

      <KeywordSuggestionsCard auditId={id} />

      <ItemList title="GEO 항목 (AI 답변 인용 최적화)" items={geo} />
      <ItemList title="SEO 항목 (검색엔진 최적화)" items={seo} />
    </div>
  );
}

function ItemList({ title, items }: { title: string; items: Item[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((i) => {
          const guide = FIX_GUIDES[i.title];
          return (
            <div key={i.id} className="rounded-lg border border-border p-4">
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
                  {i.evidence && (
                    <p className="mt-1 break-words text-xs text-muted-foreground">{i.evidence}</p>
                  )}
                  {!i.passed && i.recommendation && (
                    <p className="mt-2 text-sm">{i.recommendation}</p>
                  )}

                  {!i.passed && guide && (
                    <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Wrench className="h-4 w-4" /> 개선 방법
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{guide.why}</p>
                      <ol className="mt-2 space-y-1 text-sm">
                        {guide.steps.map((s, idx) => (
                          <li key={idx}>
                            {idx + 1}. {s}
                          </li>
                        ))}
                      </ol>
                      {guide.checklist && (
                        <div className="mt-3 rounded-md border border-border bg-background p-3">
                          <p className="text-xs font-semibold">필수 수정 체크리스트</p>
                          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                            {guide.checklist.map((c, ci) => (
                              <li key={ci} className="flex items-start gap-2">
                                <span className="mt-[3px] inline-block h-3 w-3 shrink-0 rounded-[3px] border border-muted-foreground/60" />
                                <span>{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {guide.example && (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <div className="rounded-md border border-destructive/40 p-2">
                            <p className="text-xs font-semibold text-destructive">적용 전 (문제)</p>
                            <pre className="mt-1 overflow-x-auto text-[11px] leading-relaxed">
                              {guide.example.before}
                            </pre>
                          </div>
                          <div className="rounded-md border border-[var(--chart-2)]/40 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-[var(--chart-2)]">적용 후 (권장)</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 print:hidden"
                                onClick={() => {
                                  void navigator.clipboard.writeText(guide.example?.after ?? "");
                                  toast.success("적용 후 예시를 복사했습니다.");
                                }}
                              >
                                <Copy className="mr-1 h-3 w-3" /> 복사
                              </Button>
                            </div>
                            <pre className="mt-1 overflow-x-auto text-[11px] leading-relaxed">
                              {guide.example.after}
                            </pre>
                          </div>
                        </div>
                      )}

                      {guide.snippet && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              붙여넣을 코드
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="print:hidden"
                              onClick={() => {
                                void navigator.clipboard.writeText(guide.snippet ?? "");
                                toast.success("코드를 복사했습니다.");
                              }}
                            >
                              <Copy className="mr-1 h-3.5 w-3.5" /> 복사
                            </Button>
                          </div>
                          <pre className="mt-1 overflow-x-auto rounded-md bg-background p-3 text-xs leading-relaxed">
                            {guide.snippet}
                          </pre>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

