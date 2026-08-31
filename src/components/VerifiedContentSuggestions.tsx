import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles, Link2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArticleWriter } from "@/components/ArticleWriter";
import { getVerifiedContentSuggestions } from "@/lib/insights.functions";

type Suggestion = {
  title: string;
  targetKeyword: string;
  format: string;
  outline: string[];
  intent: string;
  internalLinks: string[];
  seoGain: string;
};

/** 게시 검증을 통과한 글을 근거로 다음 콘텐츠를 제안합니다. */
export function VerifiedContentSuggestions({ auditId }: { auditId: string }) {
  const fn = useServerFn(getVerifiedContentSuggestions);

  const run = useMutation({
    mutationFn: async () => await fn({ data: { auditId, refresh: true } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const result = run.data;
  const suggestions = (result?.suggestions ?? []) as Suggestion[];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-4">
        <div>
          <CardTitle className="text-base">검증 통과 글 기반 후속 콘텐츠 제안</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            실제로 열리고 canonical·JSON-LD까지 통과한 글을 분석해, 토픽 클러스터를 넓히는 다음 글을 제안합니다.
          </p>
        </div>
        <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending} className="print:hidden">
          {run.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
          제안 생성
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result && !run.isPending && (
          <p className="text-sm text-muted-foreground">
            “제안 생성”을 누르면 검증 통과한 게시글을 기준으로 후속 콘텐츠를 추천합니다. (AI 크레딧 2 소모)
          </p>
        )}

        {result?.note && <p className="text-sm text-muted-foreground">{result.note}</p>}

        {result && result.pages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {result.pages.map((p) => (
              <Badge key={p.url} variant="secondary" className="gap-1 font-normal">
                <CheckCircle2 className="h-3 w-3 text-[var(--chart-2)]" />
                {p.title.slice(0, 40)}
              </Badge>
            ))}
          </div>
        )}

        {suggestions.map((s, i) => (
          <div key={`${s.title}-${i}`} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold">{s.title}</h4>
              {s.format && <Badge variant="outline">{s.format}</Badge>}
              {s.intent && <Badge variant="outline">{s.intent}</Badge>}
            </div>
            {s.targetKeyword && (
              <p className="mt-1 text-sm text-muted-foreground">타깃 키워드: {s.targetKeyword}</p>
            )}
            {s.outline.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {s.outline.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            )}
            {s.internalLinks.length > 0 && (
              <div className="mt-2 space-y-1">
                {s.internalLinks.map((l) => (
                  <a
                    key={l}
                    href={l}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                  >
                    <Link2 className="h-3 w-3" /> {l}
                  </a>
                ))}
              </div>
            )}
            {s.seoGain && <p className="mt-2 text-xs text-muted-foreground">기대 효과: {s.seoGain}</p>}
            <div className="mt-3 print:hidden">
              <ArticleWriter
                auditId={auditId}
                title={s.title}
                targetKeyword={s.targetKeyword}
                format={s.format}
                outline={s.outline}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
