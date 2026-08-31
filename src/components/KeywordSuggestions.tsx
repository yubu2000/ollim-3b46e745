import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArticleWriter } from "@/components/ArticleWriter";
import { getKeywordSuggestions } from "@/lib/insights.functions";

type KeywordIdea = {
  keyword: string;
  intent: string;
  reason: string;
  priority: "high" | "medium" | "low";
  source: string;
  metrics?: { clicks: number; impressions: number; ctr: number; position: number } | null;
};

type ContentIdea = { title: string; targetKeyword: string; format: string; outline: string[] };

type Suggestions = {
  usedSearchConsole?: boolean;
  keywords?: KeywordIdea[];
  contents?: ContentIdea[];
  quickWins?: string[];
};

const priorityLabel = { high: "우선", medium: "보통", low: "여유" } as const;

export function KeywordSuggestionsCard({ auditId }: { auditId: string }) {
  const fn = useServerFn(getKeywordSuggestions);

  const query = useQuery({
    queryKey: ["keyword-suggestions", auditId],
    queryFn: async () => (await fn({ data: { auditId } })) as Suggestions,
    staleTime: 5 * 60_000,
  });

  const refresh = useMutation({
    mutationFn: async () => (await fn({ data: { auditId, refresh: true } })) as Suggestions,
    onSuccess: (d) => {
      query.refetch();
      toast.success(
        d.usedSearchConsole
          ? "Search Console 데이터를 반영해 키워드 제안을 새로 만들었습니다."
          : "키워드 제안을 새로 만들었습니다.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = query.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">키워드 · 콘텐츠 제안</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {data?.usedSearchConsole
              ? "Google Search Console 실제 검색어 + 본문 분석 기반"
              : "본문 키워드 분석 기반 (Search Console을 연결하면 실제 검색 데이터가 반영됩니다)"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="print:hidden"
          disabled={refresh.isPending || query.isLoading}
          onClick={() => refresh.mutate()}
        >
          {refresh.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-4 w-4" />
          )}
          다시 생성
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {query.isLoading && <p className="text-sm text-muted-foreground">키워드를 분석하는 중…</p>}
        {query.isError && (
          <p className="text-sm text-destructive">{(query.error as Error).message}</p>
        )}

        {(data?.quickWins ?? []).length > 0 && (
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4" /> 바로 실행할 개선안
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {(data?.quickWins ?? []).map((w, i) => (
                <li key={i}>· {w}</li>
              ))}
            </ul>
          </div>
        )}

        {(data?.keywords ?? []).length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">추천 키워드</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">키워드</th>
                    <th className="py-2 pr-3">의도</th>
                    <th className="py-2 pr-3">실측 지표</th>
                    <th className="py-2">근거</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.keywords ?? []).map((k) => (
                    <tr key={k.keyword} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{k.keyword}</span>
                        <Badge
                          className="ml-2"
                          variant={k.priority === "high" ? "destructive" : "secondary"}
                        >
                          {priorityLabel[k.priority] ?? "보통"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{k.intent}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {k.metrics
                          ? `노출 ${k.metrics.impressions} · 클릭 ${k.metrics.clicks} · ${k.metrics.position}위`
                          : "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">{k.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(data?.contents ?? []).length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="h-4 w-4" /> 만들면 좋은 콘텐츠
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(data?.contents ?? []).map((c) => (
                <div key={c.title} className="rounded-lg border border-border p-4">
                  <p className="font-medium">{c.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.format} · 타깃 키워드 “{c.targetKeyword}”
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {c.outline.map((o, i) => (
                      <li key={i}>{i + 1}. {o}</li>
                    ))}
                  </ul>
                  <ArticleWriter
                    auditId={auditId}
                    title={c.title}
                    targetKeyword={c.targetKeyword}
                    format={c.format}
                    outline={c.outline}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
