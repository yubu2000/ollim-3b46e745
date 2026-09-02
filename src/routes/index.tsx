import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  FileSearch,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GEO Radar — AI 답변에 내 브랜드를 노출시키세요" },
      {
        name: "description",
        content:
          "ChatGPT·Gemini 등 AI 답변에서 내 브랜드 언급률을 추적하고, 페이지의 GEO/SEO 최적화 점수를 진단하는 모니터링 플랫폼.",
      },
      { property: "og:title", content: "GEO Radar — AI 답변에 내 브랜드를 노출시키세요" },
      {
        property: "og:description",
        content: "LLM 언급률 추적 + GEO/SEO 진단 리포트를 한 대시보드에서.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: FileSearch,
    title: "GEO/SEO 진단 리포트",
    desc: "URL 하나만 넣으면 제목·구조화 데이터·질문형 소제목·인용 가능한 수치까지 20여 개 항목을 점검하고 점수로 보여줍니다.",
  },
  {
    icon: Bot,
    title: "LLM 언급 모니터링",
    desc: "실제 고객이 물을 법한 질문을 여러 AI 모델에 던져, 내 브랜드가 언급되는지·몇 번째로 언급되는지 기록합니다.",
  },
  {
    icon: Sparkles,
    title: "콘텐츠 최적화 도우미",
    desc: "본문을 붙여넣으면 AI 인용에 유리한 구조로 재작성하고 FAQ 스키마(JSON-LD) 코드를 만들어 줍니다.",
  },
  {
    icon: BarChart3,
    title: "모델별 점수 시각화",
    desc: "모델별 언급률과 점수 추이를 그래프로 비교해, 어떤 개선이 효과가 있었는지 확인합니다.",
  },
];

function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <TrendingUp className="h-4 w-4" />
            </span>
            ollim Lab - 올림연구소
          </div>
          <Button asChild size="sm">
            <Link to={user ? "/app" : "/auth"}>{user ? "대시보드" : "무료로 시작"}</Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            GEO · Generative Engine Optimization
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
            사람들이 검색 대신 AI에게 물어봅니다.
            <br />
            그 답변에 내 브랜드가 있나요?
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            '올림연구소'는 내 페이지가 AI에게 인용되기 좋은 구조인지 진단하고, 실제 AI 모델들이 내
            브랜드를 언급하는지 주기적으로 추적합니다.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to={user ? "/app" : "/auth"}>지금 진단 시작하기</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">계정 만들기</Link>
            </Button>
          </div>

          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { k: "20+", v: "진단 항목" },
              { k: "3개", v: "추적 AI 모델" },
              { k: "1분", v: "리포트 생성" },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border border-border bg-card p-5">
                <div className="text-3xl font-bold text-primary">{s.k}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.v}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-secondary/50 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              무엇을 할 수 있나요
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {features.map((f) => (
                <Card key={f.title} className="border-border/80">
                  <CardContent className="p-6">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                      <f.icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            GEO는 이렇게 다릅니다
          </h2>
          <div className="mx-auto mt-10 grid max-w-3xl gap-3">
            {[
              "AI는 순위가 아니라 '인용하기 좋은 문장'을 고릅니다.",
              "질문형 소제목과 구체적인 숫자가 인용 확률을 높입니다.",
              "FAQ·Organization 스키마는 AI가 사실을 확신하게 만듭니다.",
              "노출은 검색 순위가 아니라 '언급률'로 측정해야 합니다.",
            ].map((t) => (
              <div
                key={t}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild size="lg">
              <Link to={user ? "/app" : "/auth"}>내 사이트 진단하기</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>GEO Radar · AI 검색 시대의 노출 모니터링</p>
        <address className="mx-auto mt-4 max-w-3xl px-5 text-xs not-italic leading-relaxed">
          상호명: 위드넷 | 서울시 금천구 시흥대로 189 인피니움타워 1013호 | 전화번호 : 02-2676-2337 |
          E-mail: web@withn.net
          <br />
          대표자: 유병욱 | 사업자등록번호: 110-06-42589 | 통신판매업신고번호 : 제2017-서울금천-0636호 |
          개인정보관리책임자 : 유병욱
        </address>
      </footer>

    </div>
  );
}
