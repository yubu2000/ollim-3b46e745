import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, ExternalLink, Loader2, Star, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getReviewSignals } from "@/lib/reviews.functions";

type ItemType = "Organization" | "LocalBusiness" | "Product";

export function ReviewSignalsCard({ projectId }: { projectId: string }) {
  const fn = useServerFn(getReviewSignals);
  const [rating, setRating] = useState("4.8");
  const [count, setCount] = useState("120");
  const [itemType, setItemType] = useState<ItemType>("Organization");
  const [verifyUrl, setVerifyUrl] = useState("");

  const payload = () => ({
    projectId,
    rating: Math.min(5, Math.max(1, Number(rating) || 4.8)),
    reviewCount: Math.max(0, Math.round(Number(count) || 0)),
    itemType,
  });

  const preview = useQuery({
    queryKey: ["review-signals", projectId, rating, count, itemType],
    queryFn: () => fn({ data: { ...payload(), verify: false } }),
  });

  const verify = useMutation({
    mutationFn: () => fn({ data: { ...payload(), verify: true, verifyUrl } }),
    onSuccess: (r) => {
      if (r.live?.hasAggregateRating) toast.success("평점 구조화 데이터가 확인되었습니다.");
      else toast.warning("페이지에서 AggregateRating을 찾지 못했습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const live = verify.data?.live ?? null;
  const snippet = preview.data?.snippet ?? "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-4 w-4" /> 평점 · 리뷰 신호 만들기
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            ChatGPT·Gemini는 페이지의 <code>AggregateRating</code> 구조화 데이터와 외부 리뷰 채널의 평점을 함께 보고
            "평점 3.6 / 리뷰 85개" 같은 답변을 만듭니다. 아래 코드를 사이트에 넣고, 리뷰 채널을 함께 채우면 인용되는
            평점과 리뷰 수가 올라갑니다.
          </p>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="rv-rating">평점 (1~5)</Label>
              <Input id="rv-rating" value={rating} onChange={(e) => setRating(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rv-count">리뷰 수</Label>
              <Input id="rv-count" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>대상 유형</Label>
              <Select value={itemType} onValueChange={(v) => setItemType(v as ItemType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Organization">브랜드/회사</SelectItem>
                  <SelectItem value="LocalBusiness">지역 업체</SelectItem>
                  <SelectItem value="Product">상품/서비스</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rv-url">검증할 URL (선택)</Label>
              <Input
                id="rv-url"
                placeholder={preview.data?.origin ?? "https://..."}
                value={verifyUrl}
                onChange={(e) => setVerifyUrl(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            실제 수집된 평점·리뷰 수만 입력하세요. 없는 리뷰를 넣으면 검색엔진 정책 위반으로 리치 결과가 제거될 수
            있습니다.
          </p>

          <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-4 text-xs">{snippet}</pre>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(snippet);
                toast.success("코드를 복사했습니다.");
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> 코드 복사
            </Button>
            <Button size="sm" onClick={() => verify.mutate()} disabled={verify.isPending}>
              {verify.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              실제 페이지에서 검증
            </Button>
          </div>

          {live && (
            <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
              <div className="flex items-center gap-2">
                {live.hasAggregateRating ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                AggregateRating{" "}
                {live.hasAggregateRating
                  ? `검출 (평점 ${live.ratingValue ?? "?"} · 리뷰 ${live.reviewCount ?? "?"}개)`
                  : "미검출"}
              </div>
              <div className="flex items-center gap-2">
                {live.hasReview ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                개별 Review 항목 {live.hasReview ? "검출" : "미검출"}
              </div>
              <p className="text-xs text-muted-foreground">
                {live.error ? live.error : `HTTP ${live.status} · ${live.finalUrl}`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">리뷰 수를 늘리는 채널 체크리스트</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(preview.data?.platforms ?? []).map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{p.name}</p>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    바로가기 <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.why}</p>
              <p className="mt-1 text-sm">{p.action}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
