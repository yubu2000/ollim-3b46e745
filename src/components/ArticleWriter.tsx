import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Code2, Copy, Download, Loader2, PenLine, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  generateArticle,
  publishArticleToWordPress,
  renderArticleHtml,
} from "@/lib/insights.functions";

type Draft = {
  title: string;
  markdown: string;
  metaTitle: string;
  metaDescription: string;
  faq: { question: string; answer: string }[];
  jsonld: string;
  wordCount: number;
};

export function ArticleWriter({
  auditId,
  title,
  targetKeyword,
  format,
  outline,
}: {
  auditId: string;
  title: string;
  targetKeyword: string;
  format: string;
  outline: string[];
}) {
  const [open, setOpen] = useState(false);
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const fn = useServerFn(generateArticle);
  const renderFn = useServerFn(renderArticleHtml);
  const publishFn = useServerFn(publishArticleToWordPress);

  const gen = useMutation({
    mutationFn: async () =>
      (await fn({
        data: { auditId, title, targetKeyword, format, outline, length },
      })) as unknown as Draft,
    onSuccess: (d) => {
      setDraft(d);
      setHtml(null);
      toast.success("글 초안을 생성했습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toHtml = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("먼저 초안을 생성해 주세요.");
      const res = (await renderFn({
        data: {
          title: draft.title,
          markdown: draft.markdown,
          faq: draft.faq,
          jsonld: draft.jsonld,
        },
      })) as unknown as { html: string };
      return res.html;
    },
    onSuccess: (h) => {
      setHtml(h);
      toast.success("HTML로 변환했습니다. 아래에서 복사하거나 저장하세요.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: async (status: "draft" | "publish") => {
      if (!draft) throw new Error("먼저 초안을 생성해 주세요.");
      return (await publishFn({
        data: {
          title: draft.title,
          markdown: draft.markdown,
          metaDescription: draft.metaDescription,
          faq: draft.faq,
          jsonld: draft.jsonld,
          status,
        },
      })) as unknown as { id: number | null; link: string | null; status: string };
    },
    onSuccess: (r) => {
      toast.success(
        r.status === "publish"
          ? `WordPress에 게시했습니다.${r.link ? ` (${r.link})` : ""}`
          : "WordPress에 임시글(draft)로 저장했습니다.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fullText = draft
    ? `# ${draft.title}\n\n${draft.markdown}\n\n## 자주 묻는 질문\n\n${draft.faq
        .map((f) => `**${f.question}**\n\n${f.answer}`)
        .join("\n\n")}\n`
    : "";

  const safeName = title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);

  function downloadFile(content: string, ext: string, mime: string) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }


  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3 print:hidden"
        onClick={() => {
          setOpen(true);
          if (!draft) gen.mutate();
        }}
      >
        <PenLine className="mr-1 h-4 w-4" /> 글 자동 생성
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription>
              {format} · 타깃 키워드 “{targetKeyword}” · 목차 {outline.length}개 기반 초안
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={length} onValueChange={(v) => setLength(v as typeof length)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">짧게 (약 800자)</SelectItem>
                <SelectItem value="medium">보통 (약 1400자)</SelectItem>
                <SelectItem value="long">길게 (약 2200자)</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" disabled={gen.isPending} onClick={() => gen.mutate()}>
              {gen.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <PenLine className="mr-1 h-4 w-4" />
              )}
              {draft ? "다시 생성" : "생성"}
            </Button>
            {draft && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(fullText);
                    toast.success("마크다운 본문을 복사했습니다.");
                  }}
                >
                  <Copy className="mr-1 h-4 w-4" /> 마크다운 복사
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadFile(fullText, "md", "text/markdown")}
                >
                  <Download className="mr-1 h-4 w-4" /> .md 저장
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={toHtml.isPending}
                  onClick={() => toHtml.mutate()}
                >
                  {toHtml.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Code2 className="mr-1 h-4 w-4" />
                  )}
                  HTML로 변환
                </Button>
                <Button
                  size="sm"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate("publish")}
                >
                  {publish.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  WordPress에 배포하기
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate("draft")}
                >
                  WordPress 임시저장
                </Button>
              </>
            )}

          </div>

          {gen.isPending && !draft && (
            <p className="text-sm text-muted-foreground">
              목차를 바탕으로 글을 작성하는 중입니다… 30초 정도 걸릴 수 있어요.
            </p>
          )}

          {draft && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium">검색 노출용 메타</p>
                <p className="mt-1 text-muted-foreground">제목: {draft.metaTitle}</p>
                <p className="text-muted-foreground">설명: {draft.metaDescription}</p>
                <p className="mt-1 text-xs text-muted-foreground">약 {draft.wordCount} 단어</p>
              </div>

              <Textarea
                value={fullText}
                readOnly
                className="min-h-[380px] font-mono text-xs leading-relaxed"
              />

              {html && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">HTML (관리자 화면에 그대로 붙여넣기)</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(html);
                        toast.success("HTML을 복사했습니다.");
                      }}
                    >
                      <Copy className="mr-1 h-4 w-4" /> HTML 복사
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadFile(html, "html", "text/html")}
                    >
                      <Download className="mr-1 h-4 w-4" /> .html 저장
                    </Button>
                  </div>
                  <Textarea
                    value={html}
                    readOnly
                    className="min-h-[260px] font-mono text-xs leading-relaxed"
                  />
                </div>
              )}


              <details className="rounded-lg border border-border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  구조화 데이터 (JSON-LD) — 페이지 &lt;head&gt;에 붙여넣기
                </summary>
                <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground">
                  {draft.jsonld}
                </pre>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
