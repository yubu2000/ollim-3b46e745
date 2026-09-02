import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle } from "lucide-react";
import { listPublishVerifications } from "@/lib/insights.functions";

type Row = {
  id: string;
  url: string;
  final_url: string;
  status: number;
  reachable: boolean;
  has_canonical: boolean;
  has_jsonld: boolean;
  jsonld_types: string[];
  passed_count: number;
  total_count: number;
  created_at: string;
};

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--chart-2)]" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-destructive" />
      )}
      {label}
    </span>
  );
}

/** Verification results recorded for this report — 블로그 게시 후 자동으로도 채워집니다. */
export function PublishVerificationHistory({ auditId }: { auditId: string }) {
  const fn = useServerFn(listPublishVerifications);
  const q = useQuery({
    queryKey: ["publish-verifications", auditId],
    queryFn: async () => (await fn({ data: { auditId } })) as unknown as Row[],
    refetchInterval: 60_000,
  });

  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        아직 기록된 게시 검증 결과가 없습니다. 위에서 주소를 검증하거나 블로그에 배포하면 자동으로 기록됩니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">검증 기록</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3">주소</th>
              <th className="py-2 pr-3">응답</th>
              <th className="py-2 pr-3">canonical</th>
              <th className="py-2 pr-3">JSON-LD</th>
              <th className="py-2 pr-3">통과</th>
              <th className="py-2">검증 시각</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 align-top">
                <td className="max-w-[240px] break-words py-2 pr-3">{r.final_url || r.url}</td>
                <td className="py-2 pr-3">
                  <Flag ok={r.reachable} label={`HTTP ${r.status}`} />
                </td>
                <td className="py-2 pr-3">
                  <Flag ok={r.has_canonical} label={r.has_canonical ? "포함" : "없음"} />
                </td>
                <td className="py-2 pr-3">
                  <Flag
                    ok={r.has_jsonld}
                    label={r.has_jsonld ? (r.jsonld_types[0] ?? "포함") : "없음"}
                  />
                </td>
                <td className="py-2 pr-3">
                  {r.passed_count}/{r.total_count}
                </td>
                <td className="py-2 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ko-KR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
