import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Copy, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateSchemas } from "@/lib/insights.functions";
import type { SchemaIssue, SchemaValidation } from "@/lib/schema";

type Result = {
  source: { url: string; title: string; headings: string[] };
  existing: { count: number; types: string[]; validation: SchemaValidation[] };
  schemas: { key: string; label: string; json: string; validation: SchemaValidation }[];
};

function IssueList({ issues }: { issues: SchemaIssue[] }) {
  if (issues.length === 0)
    return (
      <p className="flex items-center gap-1 text-xs text-[var(--chart-2)]">
        <CheckCircle2 className="h-3.5 w-3.5" /> 오류·경고 없음
      </p>
    );
  return (
    <ul className="space-y-1 text-xs">
      {issues.map((i, idx) => (
        <li key={idx} className="flex items-start gap-1.5">
          {i.level === "error" ? (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--chart-4)]" />
          )}
          <span className="text-muted-foreground">
            <span className="font-mono">{i.path}</span> — {i.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SchemaStudio({ auditId }: { auditId: string }) {
  const fn = useServerFn(generateSchemas);
  const gen = useMutation({
    mutationFn: async () => (await fn({ data: { auditId } })) as unknown as Result,
    onError: (e: Error) => toast.error(e.message),
  });

  const res = gen.data;
  const existingErrors = (res?.existing.validation ?? []).flatMap((v) =>
    v.issues.filter((i) => i.level === "error"),
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">스키마(JSON-LD) 자동 생성 · 유효성 검사</CardTitle>
        <Button size="sm" disabled={gen.isPending} onClick={() => gen.mutate()} className="print:hidden">
          {gen.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-1 h-4 w-4" />
          )}
          {res ? "다시 검사" : "생성 및 검사"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!res && !gen.isPending && (
          <p className="text-sm text-muted-foreground">
            페이지의 제목·소제목·요약을 읽어 FAQPage / Article / Organization 스키마를 자동으로 만들고, 이미
            적용된 스키마의 문법·필수항목 오류까지 검사합니다.
          </p>
        )}

        {res && (
          <>
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">현재 페이지에 적용된 스키마</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {res.existing.count === 0
                  ? "적용된 JSON-LD가 없습니다. 아래 스키마를 그대로 붙여넣으세요."
                  : `${res.existing.count}개 블록 · ${res.existing.types.join(", ") || "타입 미확인"} · 오류 ${existingErrors.length}건`}
              </p>
              {existingErrors.length > 0 && (
                <div className="mt-2">
                  <IssueList issues={existingErrors} />
                </div>
              )}
            </div>

            {res.schemas.map((s) => (
              <div key={s.key} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {s.label}
                    <Badge variant={s.validation.valid ? "default" : "destructive"}>
                      {s.validation.valid ? "유효" : "오류 있음"}
                    </Badge>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="print:hidden"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `<script type="application/ld+json">\n${s.json}\n</script>`,
                      );
                      toast.success("스키마를 복사했습니다.");
                    }}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" /> 복사
                  </Button>
                </div>
                <div className="mt-2">
                  <IssueList issues={s.validation.issues} />
                </div>
                <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
                  {s.json}
                </pre>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
