import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Code2,
  Copy,
  Download,
  ImagePlus,
  Loader2,
  PenLine,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
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
import { PublishVerifier } from "@/components/PublishVerifier";

import {
  createArticleImage,
  generateArticle,
  publishArticleToWordPress,
  renderArticleHtml,
} from "@/lib/insights.functions";

type ArticleImage = { dataUrl: string; alt: string; filename: string };


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
  const [publishedUrl, setPublishedUrl] = useState<string>("");
  const [html, setHtml] = useState<string | null>(null);
  const [images, setImages] = useState<ArticleImage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const fn = useServerFn(generateArticle);
  const renderFn = useServerFn(renderArticleHtml);
  const publishFn = useServerFn(publishArticleToWordPress);
  const imageFn = useServerFn(createArticleImage);

  const makeImage = useMutation({
    mutationFn: async () =>
      (await imageFn({
        data: { prompt: `${title} / 핵심 키워드: ${targetKeyword}` },
      })) as unknown as { dataUrl: string },
    onSuccess: (r) => {
      setImages((prev) => [
        ...prev,
        { dataUrl: r.dataUrl, alt: title, filename: `ai-${prev.length + 1}` },
      ]);
      toast.success("이미지를 생성했습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function addFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 5)) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
        reader.readAsDataURL(file);
      });
      setImages((prev) => [
        ...prev,
        { dataUrl, alt: title, filename: file.name.replace(/\.[^.]+$/, "") },
      ]);
    }
  }


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
          images: images.map((i) => ({ dataUrl: i.dataUrl, alt: i.alt, filename: i.filename })),
        },
      })) as unknown as {
        id: number | null;
        link: string | null;
        status: string;
        target: string;
        images: number;
      };
    },
    onSuccess: (r) => {
      if (r.link) setPublishedUrl(r.link);
      toast.success(
        r.status === "publish"
          ? `${r.target}에 게시했습니다.${r.images ? ` 이미지 ${r.images}장 포함.` : ""}${r.link ? ` (${r.link})` : ""}`
          : `${r.target}에 임시글(draft)로 저장했습니다.`,
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
                  블로그에 배포하기
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate("draft")}
                >
                  블로그 임시저장
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

              <div className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">본문 이미지</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="mr-1 h-4 w-4" /> 파일 첨부
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={makeImage.isPending}
                    onClick={() => makeImage.mutate()}
                  >
                    {makeImage.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-4 w-4" />
                    )}
                    AI 이미지 생성
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  첫 번째 이미지는 대표 이미지로, 나머지는 소제목 사이에 자동 삽입됩니다.
                </p>
                {images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {images.map((img, i) => (
                      <div key={i} className="relative">
                        <img
                          src={img.dataUrl}
                          alt={img.alt}
                          className="h-24 w-32 rounded-md border border-border object-cover"
                        />
                        <button
                          type="button"
                          aria-label="이미지 제거"
                          className="absolute -right-2 -top-2 rounded-full bg-secondary p-1 text-secondary-foreground shadow"
                          onClick={() => setImages((prev) => prev.filter((_, x) => x !== i))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">게시 검증</p>
                <p className="mb-2 mt-1 text-xs text-muted-foreground">
                  게시한 글이 실제로 열리는지, 최종 HTML에 canonical과 JSON-LD가 포함됐는지 확인합니다.
                </p>
                <PublishVerifier
                  defaultUrl={publishedUrl}
                  expectTitle={draft.title}
                  auditId={auditId}
                  autoVerify
                  compact
                />

              </div>


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
