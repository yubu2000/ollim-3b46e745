import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, HelpCircle, Loader2, Search, Tags } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getKeywordResearch } from "@/lib/research.functions";
import type { KeywordResearch } from "@/lib/research.server";

export const Route = createFileRoute("/app/research")({
  head: () => ({
    meta: [
      { title: "키워드 리서치 — ollim Lab" },
      { name: "description", content: "키워드 관련 주제와 AI 타깃 질문을 분석합니다." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResearchPage,
});

const sourceLabel = { chatgpt: "ChatGPT", "people-also-ask": "Google 연관질문" } as const;

function ResearchPage() {
  const fn = useServerFn(getKeywordResearch);
  const [keyword, setKeyword] = useState("");

  const research = useMutation({
    mutationFn: async (kw: string) => (await fn({ data: { keyword: kw } })) as KeywordResearch,
    onError: (e: Error) => toast.error(e.message),
  });

  const data = research.data;

  const submit = () => {
    const kw = keyword.trim();
    if (!kw) return;
    research.mutate(kw);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">키워드 리서치</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          키워드를 입력하면 Google 자동완성 검색어, 관련 주제, ChatGPT에서 사용자가 물어볼 타깃 질문을
          보여드립니다.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="예: 중고차 사고이력 조회"
          className="max-w-md bg-background"
        />
        <Button type="submit" disabled={research.isPending || !keyword.trim()}>
          {research.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-1 h-4 w-4" />
          )}
          분석
        </Button>
      </form>

      {research.isPending && (
        <p className="text-sm text-muted-foreground">관련 주제와 질문을 분석하는 중…</p>
      )}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" /> Google 자동완성 검색어
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                “{data.keyword}”에 대해 Google이 실제로 추천하는 검색어
              </p>
            </CardHeader>
            <CardContent>
              {data.googleSuggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">자동완성 결과가 없습니다.</p>
              ) : (
                <ol className="grid gap-2 sm:grid-cols-2">
                  {data.googleSuggestions.map((s, i) => (
                    <li key={s} className="flex items-start gap-2 text-sm">
                      <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
                        {i + 1}.
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Tags className="h-4 w-4" /> 관련 주제
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                이 키워드로 콘텐츠를 만들 때 함께 다루면 좋은 주제
              </p>
            </CardHeader>
            <CardContent>
              {data.topics.length === 0 ? (
                <p className="text-sm text-muted-foreground">생성된 주제가 없습니다.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.topics.map((t) => (
                    <div key={t.topic} className="rounded-lg border border-border p-4">
                      <p className="font-medium">{t.topic}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HelpCircle className="h-4 w-4" /> 타깃 질문
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                사용자가 AI(ChatGPT)나 Google에 실제로 물어볼 만한 질문 — 콘텐츠 소제목/FAQ로 활용하세요
              </p>
            </CardHeader>
            <CardContent>
              {data.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">생성된 질문이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {data.questions.map((q) => (
                    <li
                      key={q.question}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm"
                    >
                      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{q.question}</span>
                      <span className="ml-auto flex gap-1">
                        <Badge variant="secondary">{q.intent}</Badge>
                        <Badge variant="outline">{sourceLabel[q.source]}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
