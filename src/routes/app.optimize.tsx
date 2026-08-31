import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProjects } from "@/lib/project-context";
import { optimizeContent } from "@/lib/geo.functions";
import { publishArticleToWordPress } from "@/lib/insights.functions";
import { WordPressSettings } from "@/components/WordPressSettings";


export const Route = createFileRoute("/app/optimize")({
  component: OptimizePage,
});

function OptimizePage() {
  const { project } = useProjects();
  const optimize = useServerFn(optimizeContent);
  const publishFn = useServerFn(publishArticleToWordPress);
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState<{ link: string | null; status: string } | null>(null);

  const run = useMutation({
    mutationFn: async () =>
      optimize({
        data: { brand: project?.brand_name ?? "", topic, content },
      }),
    onSuccess: () => setPublished(null),
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: async (status: "draft" | "publish") => {
      const rewrite = run.data?.rewrite ?? "";
      if (!rewrite.trim()) throw new Error("먼저 GEO 최적화를 실행해 주세요.");
      return publishFn({
        data: {
          title: topic.trim() || (project?.brand_name ?? "최적화 콘텐츠"),
          markdown: rewrite,
          metaDescription: rewrite.replace(/[#*`>-]/g, "").trim().slice(0, 150),
          faq: [],
          ...(run.data?.faq ? { jsonld: run.data.faq } : {}),
          status,
        },
      });
    },
    onSuccess: (res) => {
      setPublished({ link: res.link, status: res.status });
      toast.success(res.status === "publish" ? "WordPress에 게시했습니다." : "WordPress에 임시저장했습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success("복사했습니다.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">콘텐츠 최적화</h1>
        <p className="text-sm text-muted-foreground">
          AI가 인용하기 좋은 구조로 본문을 다시 쓰고 FAQ 스키마를 만들어 드립니다.
        </p>
      </div>

      <WordPressSettings />



      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="topic">주제 / 타깃 질문</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 몰디브 허니문 패키지 가격과 일정"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content">기존 본문</Label>
            <Textarea
              id="content"
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="최적화할 페이지의 본문을 붙여넣으세요."
            />
          </div>
          <Button
            onClick={() => run.mutate()}
            disabled={run.isPending || !topic.trim() || !content.trim() || !project}
          >
            {run.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            GEO 최적화 실행
          </Button>
        </CardContent>
      </Card>

      {run.data && (
        <>
          <ResultCard title="재작성된 본문" body={run.data.rewrite} onCopy={copy} />
          <ResultCard title="FAQ JSON-LD (페이지 <head>에 삽입)" body={run.data.faq} mono onCopy={copy} />
          <ResultCard title="추가 개선 팁" body={run.data.tips} onCopy={copy} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">WordPress 배포</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                재작성된 본문과 FAQ 스키마를 함께 담아 연결된 WordPress 블로그로 보냅니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={publish.isPending} onClick={() => publish.mutate("publish")}>
                  {publish.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  WordPress에 배포하기
                </Button>
                <Button
                  variant="outline"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate("draft")}
                >
                  WordPress 임시저장
                </Button>
              </div>
              {published?.link && (
                <a
                  href={published.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-sm text-primary underline"
                >
                  <ExternalLink className="mr-1 h-4 w-4" /> 게시된 글 열기
                </a>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ResultCard({
  title,
  body,
  mono,
  onCopy,
}: {
  title: string;
  body: string;
  mono?: boolean;
  onCopy: (t: string) => void;
}) {
  if (!body) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => onCopy(body)}>
          <Copy className="mr-1 h-4 w-4" /> 복사
        </Button>
      </CardHeader>
      <CardContent>
        <pre
          className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${mono ? "font-mono text-xs" : ""}`}
        >
          {body}
        </pre>
      </CardContent>
    </Card>
  );
}
