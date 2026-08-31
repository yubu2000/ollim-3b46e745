import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, SearchCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifyPublishedUrl } from "@/lib/insights.functions";
import type { SchemaIssue } from "@/lib/schema";

type Verification = {
  finalUrl: string;
  status: number;
  checks: { id: string; label: string; passed: boolean; detail: string }[];
  schemaIssues: SchemaIssue[];
};

export function PublishVerifier({
  defaultUrl = "",
  expectTitle,
  compact = false,
  auditId,
  autoVerify = false,
}: {
  defaultUrl?: string;
  expectTitle?: string;
  compact?: boolean;
  auditId?: string;
  autoVerify?: boolean;
}) {
  const [url, setUrl] = useState(defaultUrl);
  const fn = useServerFn(verifyPublishedUrl);
  const qc = useQueryClient();

  const check = useMutation({
    mutationFn: async () => {
      if (!url.trim()) throw new Error("검증할 주소를 입력해 주세요.");
      return (await fn({
        data: {
          url,
          ...(expectTitle ? { expectTitle } : {}),
          ...(auditId ? { auditId } : {}),
        },
      })) as unknown as Verification;
    },
    onSuccess: (r) => {
      if (auditId) void qc.invalidateQueries({ queryKey: ["publish-verifications", auditId] });
      const failed = r.checks.filter((c) => !c.passed).length;
      if (failed === 0) toast.success("게시 검증 통과 — 실제로 열리고 canonical·JSON-LD도 확인됐습니다.");
      else toast.warning(`검증 완료 — ${failed}개 항목이 통과하지 못했습니다.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // 게시 직후 받은 주소는 한 번 자동으로 검증해 리포트에 반영한다.
  const checkRef = useRef(check);
  checkRef.current = check;
  const autoDone = useRef("");
  useEffect(() => {
    setUrl(defaultUrl);
    if (!autoVerify || !defaultUrl || autoDone.current === defaultUrl) return;
    autoDone.current = defaultUrl;
    checkRef.current.mutate();
  }, [defaultUrl, autoVerify]);

  const errors = (check.data?.schemaIssues ?? []).filter((i) => i.level === "error");


  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://mu4go.com/게시된-글-주소"
          className={compact ? "h-9 max-w-md" : "max-w-md"}
        />
        <Button size="sm" disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <SearchCheck className="mr-1 h-4 w-4" />
          )}
          게시 검증
        </Button>
      </div>

      {check.data && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">
            HTTP {check.data.status} · {check.data.finalUrl}
          </p>
          <ul className="space-y-1.5">
            {check.data.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                {c.passed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chart-2)]" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <span className="min-w-0">
                  <span className="font-medium">{c.label}</span>
                  <span className="block break-words text-xs text-muted-foreground">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {errors.length > 0 && (
            <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">스키마 오류</p>
              {errors.map((e, i) => (
                <p key={i}>
                  <span className="font-mono">{e.path}</span> — {e.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
