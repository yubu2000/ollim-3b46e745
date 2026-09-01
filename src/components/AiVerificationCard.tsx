import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, Quote, TriangleAlert } from "lucide-react";

export type AiVerification = {
  model: string;
  label: string;
  ok: boolean;
  geoScore: number | null;
  verdict: string;
  quotable: string[];
  gaps: string[];
  checkedAt: string;
};

/** 실제 LLM(Gemini/GPT)이 페이지 본문을 읽고 내린 GEO 교차 검증 결과. */
export function AiVerificationCard({ data }: { data: unknown }) {
  const results = Array.isArray(data) ? (data as AiVerification[]) : [];
  if (results.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgeCheck className="h-4 w-4" /> 실제 AI 모델 교차 검증
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          페이지 본문을 실제 모델에 전달해 인용 가능성을 직접 판단한 결과입니다.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {results.map((r) => (
          <div key={r.model} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{r.label}</span>
              {r.ok ? (
                <Badge variant="secondary">GEO {r.geoScore ?? "-"}</Badge>
              ) : (
                <Badge variant="destructive">호출 실패</Badge>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.verdict}</p>
            {r.quotable.length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Quote className="h-3 w-3" /> 인용 가능한 문장
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {r.quotable.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.gaps.length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <TriangleAlert className="h-3 w-3" /> 인용을 막는 요인
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {r.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              검증 {new Date(r.checkedAt).toLocaleString("ko-KR")} · {r.model}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
