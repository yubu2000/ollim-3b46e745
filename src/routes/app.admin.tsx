import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminListPayments,
  adminListUsers,
  adminResetUsage,
  adminSetOverride,
  adminSetPlan,
  getAdminStatus,
} from "@/lib/admin.functions";
import { formatKrw } from "@/lib/plans";

export const Route = createFileRoute("/app/admin")({
  head: () => ({
    meta: [
      { title: "마스터 관리자 — ollim Lab" },
      { name: "description", content: "회원 계정과 결제 상태, 한도 예외를 관리합니다." },
      { property: "og:title", content: "마스터 관리자 — ollim Lab" },
      { property: "og:description", content: "회원관리와 결제관리 콘솔." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const statusFn = useServerFn(getAdminStatus);
  const status = useQuery({ queryKey: ["admin-status"], queryFn: () => statusFn({}) });

  if (status.isLoading) return <p className="text-sm text-muted-foreground">확인 중…</p>;
  if (!status.data?.admin)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          마스터 관리자 권한이 있는 계정만 접근할 수 있습니다.
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">마스터 관리자</h1>
      </div>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">회원관리</TabsTrigger>
          <TabsTrigger value="billing">결제관리</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="billing" className="mt-4">
          <PaymentsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListUsers);
  const overrideFn = useServerFn(adminSetOverride);
  const resetFn = useServerFn(adminResetUsage);
  const planFn = useServerFn(adminSetPlan);
  const [editing, setEditing] = useState<string | null>(null);
  const [audits, setAudits] = useState("");
  const [mentions, setMentions] = useState("");
  const [exports, setExports] = useState(true);

  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => listFn({}) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const saveOverride = useMutation({
    mutationFn: async (userId: string) =>
      overrideFn({
        data: {
          userId,
          audits: audits.trim() === "" ? null : Number(audits),
          mentions: mentions.trim() === "" ? null : Number(mentions),
          exports,
          note: null,
        },
      }),
    onSuccess: () => {
      toast.success("한도 예외를 저장했습니다.");
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearOverride = useMutation({
    mutationFn: async (userId: string) =>
      overrideFn({ data: { userId, audits: null, mentions: null, exports: null, note: null } }),
    onSuccess: () => {
      toast.success("예외를 해제하고 플랜 기본값으로 되돌렸습니다.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetUsage = useMutation({
    mutationFn: async (userId: string) => resetFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("이번 달 사용량을 초기화했습니다.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPlan = useMutation({
    mutationFn: async (v: { userId: string; plan: "free" | "pro" | "business" }) => planFn({ data: v }),
    onSuccess: () => {
      toast.success("플랜을 변경했습니다.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (users.isLoading) return <p className="text-sm text-muted-foreground">회원 목록을 불러오는 중…</p>;
  if (users.isError) return <p className="text-sm text-destructive">{(users.error as Error).message}</p>;

  return (
    <div className="space-y-4">
      {(users.data?.users ?? []).map((u) => (
        <Card key={u.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {u.email}
              {u.role === "admin" && <Badge>관리자</Badge>}
              <Badge variant="outline">{u.plan.toUpperCase()}</Badge>
              {u.override && <Badge variant="secondary">한도 예외 적용</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <Stat label="진단 사용" value={`${u.usage.audit} / ${u.limits.audit}`} />
              <Stat label="멘션 사용" value={`${u.usage.mention} / ${u.limits.mention}`} />
              <Stat label="리포트 다운로드" value={u.limits.exports ? "허용" : "차단"} />
              <Stat label="프로젝트" value={`${u.projects}개`} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={u.plan} onValueChange={(v) => setPlan.mutate({ userId: u.id, plan: v as "free" })}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(editing === u.id ? null : u.id);
                  setAudits(u.override?.audits != null ? String(u.override.audits) : "");
                  setMentions(u.override?.mentions != null ? String(u.override.mentions) : "");
                  setExports(u.override?.exports ?? true);
                }}
              >
                한도 예외 설정
              </Button>
              <Button size="sm" variant="ghost" onClick={() => resetUsage.mutate(u.id)}>
                <RotateCcw className="mr-1 h-4 w-4" /> 이번 달 사용량 초기화
              </Button>
              {u.override && (
                <Button size="sm" variant="ghost" onClick={() => clearOverride.mutate(u.id)}>
                  예외 해제
                </Button>
              )}
            </div>

            {editing === u.id && (
              <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>월 진단 한도</Label>
                  <Input value={audits} onChange={(e) => setAudits(e.target.value)} placeholder="예: 500 (비우면 기본값)" />
                </div>
                <div className="space-y-1.5">
                  <Label>월 멘션 체크 한도</Label>
                  <Input value={mentions} onChange={(e) => setMentions(e.target.value)} placeholder="예: 500 (비우면 기본값)" />
                </div>
                <div className="space-y-1.5">
                  <Label>리포트 다운로드·공유 링크</Label>
                  <div className="flex h-10 items-center gap-2">
                    <Switch checked={exports} onCheckedChange={setExports} />
                    <span className="text-sm">{exports ? "허용" : "차단"}</span>
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <Button size="sm" disabled={saveOverride.isPending} onClick={() => saveOverride.mutate(u.id)}>
                    {saveOverride.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    저장
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PaymentsPanel() {
  const listFn = useServerFn(adminListPayments);
  const payments = useQuery({ queryKey: ["admin-payments"], queryFn: () => listFn({}) });

  if (payments.isLoading) return <p className="text-sm text-muted-foreground">결제 정보를 불러오는 중…</p>;
  if (payments.isError) return <p className="text-sm text-destructive">{(payments.error as Error).message}</p>;

  const { rows, summary } = payments.data!;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="월 반복 매출(MRR)" value={formatKrw(summary.mrr)} />
        <Stat label="유료 구독" value={`${summary.paying}건`} />
        <Stat label="결제 레코드" value={`${summary.total}건`} />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">구독 내역</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 결제 내역이 없습니다.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">이메일</th>
                  <th className="py-2 pr-3">플랜</th>
                  <th className="py-2 pr-3">상태</th>
                  <th className="py-2 pr-3">다음 결제일</th>
                  <th className="py-2">업데이트</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium">{r.email}</td>
                    <td className="py-2 pr-3">{r.plan.toUpperCase()}</td>
                    <td className="py-2 pr-3">{r.status}</td>
                    <td className="py-2 pr-3">
                      {r.currentPeriodEnd ? new Date(r.currentPeriodEnd).toLocaleDateString("ko-KR") : "-"}
                    </td>
                    <td className="py-2">{new Date(r.updatedAt).toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
