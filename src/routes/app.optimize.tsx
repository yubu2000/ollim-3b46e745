import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProjects } from "@/lib/project-context";
import { optimizeContent } from "@/lib/geo.functions";

export const Route = createFileRoute("/app/optimize")({
  component: OptimizePage,
});

function OptimizePage() {
  const { project } = useProjects();
  const optimize = useServerFn(optimizeContent);
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");

  const run = useMutation({
    mutationFn: async () =>
      optimize({
        data: { brand: project?.brand_name ?? "", topic, content },
      }),
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
          <ResultCard title="FAQ JSON-LD (페이지 <head>에 삽입)" body={run.data.faqJsonLd} mono onCopy={copy} />
          <ResultCard title="추가 개선 팁" body={run.data.tips} onCopy={copy} />
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
