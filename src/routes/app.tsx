import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  BarChart3,
  BellRing,
  Bot,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Sparkles,
  Swords,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { ProjectProvider, useProjects } from "@/lib/project-context";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "대시보드 — GEO Radar" },
      { name: "description", content: "프로젝트별 GEO/SEO 점수와 AI 언급률을 모니터링합니다." },
      { property: "og:title", content: "대시보드 — GEO Radar" },
      { property: "og:description", content: "GEO/SEO 점수와 AI 언급률 모니터링 대시보드." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppLayout,
});

const nav = [
  { to: "/app", label: "대시보드", icon: LayoutDashboard, exact: true },
  { to: "/app/mentions", label: "LLM 언급 추적", icon: Bot, exact: false },
  { to: "/app/optimize", label: "콘텐츠 최적화", icon: Sparkles, exact: false },
  { to: "/app/reports", label: "리포트", icon: BarChart3, exact: false },
] as const;

function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        불러오는 중…
      </div>
    );
  }

  return (
    <ProjectProvider>
      <div className="min-h-screen bg-secondary/40">
        <header className="sticky top-0 z-30 border-b border-border bg-background">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <TrendingUp className="h-4 w-4" />
              </span>
              <span className="hidden sm:inline">GEO Radar</span>
            </Link>
            <ProjectSwitcher />
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground md:inline">{user.email}</span>
              <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="로그아웃">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.exact }}
                className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary"
                activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">
          <Outlet />
        </main>
      </div>
    </ProjectProvider>
  );
}

function ProjectSwitcher() {
  const { projects, project, selectProject } = useProjects();
  if (projects.length === 0) return null;
  return (
    <Select value={project?.id ?? ""} onValueChange={selectProject}>
      <SelectTrigger className="w-[200px] bg-background">
        <SelectValue placeholder="프로젝트 선택" />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
