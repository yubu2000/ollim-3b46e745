import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Bot,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { ProjectProvider, useProjects } from "@/lib/project-context";
import { getAdminStatus } from "@/lib/admin.functions";

const navLinkClass =
  "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary outline-none";


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

type NavItem = { to: string; label: string; exact: boolean };
type NavGroup = { label: string; icon: typeof LayoutDashboard; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "콘텐츠 · 키워드",
    icon: Sparkles,
    items: [
      { to: "/app/research", label: "키워드 리서치", exact: false },
      { to: "/app/optimize", label: "콘텐츠 최적화", exact: false },
    ],
  },
  {
    label: "모니터링",
    icon: Bot,
    items: [
      { to: "/app/mentions", label: "LLM 언급 추적", exact: false },
      { to: "/app/competitors", label: "경쟁사 비교", exact: false },
      { to: "/app/alerts", label: "알림", exact: false },
    ],
  },
  {
    label: "리포트 · 계정",
    icon: BarChart3,
    items: [
      { to: "/app/reports", label: "리포트", exact: false },
      { to: "/app/billing", label: "요금제", exact: false },
      { to: "/app/subscribe", label: "구독 구매", exact: false },
    ],
  },
];



function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const statusFn = useServerFn(getAdminStatus);
  const adminStatus = useQuery({
    queryKey: ["admin-status", user?.id],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: () => statusFn({}),
  });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

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
              <span className="hidden sm:inline">ollim Lab -올림연구소</span>
            </Link>
            <ProjectSwitcher />
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground md:inline">{user.email}</span>
              <Button variant="ghost" size="icon" onClick={() => void handleSignOut()} aria-label="로그아웃">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 pb-2">
            <Link
              to="/app"
              activeOptions={{ exact: true }}
              className={navLinkClass}
              activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
            >
              <LayoutDashboard className="h-4 w-4" />
              대시보드
            </Link>

            {navGroups.map((group) => (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger className={navLinkClass}>
                  <group.icon className="h-4 w-4" />
                  {group.label}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {group.items.map((item) => (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link
                        to={item.to}
                        activeOptions={{ exact: item.exact }}
                        activeProps={{ className: "font-medium text-accent-foreground" }}
                      >
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}

            {adminStatus.data?.admin && (
              <Link
                to="/app/admin"
                className={navLinkClass}
                activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
              >
                <ShieldCheck className="h-4 w-4" />
                마스터 관리자
              </Link>
            )}
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
