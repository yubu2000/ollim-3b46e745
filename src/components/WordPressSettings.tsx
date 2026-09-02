import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Globe, Loader2, Trash2 } from "lucide-react";
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
import {
  deleteWordPressSite,
  getWordPressSite,
  saveWordPressSite,
} from "@/lib/insights.functions";

type Site = {
  site_url: string;
  username: string;
  default_status: string;
  last_checked_at: string | null;
  last_check_ok: boolean | null;
};

/** Per-member blog connection used when publishing generated drafts. */
export function WordPressSettings() {
  const qc = useQueryClient();
  const getFn = useServerFn(getWordPressSite);
  const saveFn = useServerFn(saveWordPressSite);
  const delFn = useServerFn(deleteWordPressSite);

  const site = useQuery({
    queryKey: ["wordpress-site"],
    queryFn: async () => (await getFn()) as unknown as Site | null,
  });

  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [defaultStatus, setDefaultStatus] = useState<"draft" | "publish">("draft");

  useEffect(() => {
    if (!site.data) return;
    setSiteUrl(site.data.site_url);
    setUsername(site.data.username);
    setDefaultStatus(site.data.default_status === "publish" ? "publish" : "draft");
  }, [site.data]);

  const save = useMutation({
    mutationFn: async () =>
      saveFn({ data: { siteUrl, username, appPassword, defaultStatus } }),
    onSuccess: async () => {
      setAppPassword("");
      await qc.invalidateQueries({ queryKey: ["wordpress-site"] });
      toast.success("블로그 연결을 확인하고 저장했습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => delFn(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["wordpress-site"] });
      setAppPassword("");
      toast.success("연결을 삭제했습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4" /> 내 블로그 연결
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          회원 각자의 블로그로 글이 배포됩니다. 블로그 관리자 &gt; 사용자 &gt; 프로필에서
          “애플리케이션 비밀번호”를 발급해 입력해 주세요.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {site.data && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--chart-2)]" />
            현재 연결: {site.data.site_url} ({site.data.username})
            {site.data.last_checked_at &&
              ` · 확인 ${new Date(site.data.last_checked_at).toLocaleString("ko-KR")}`}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wp-url">사이트 주소</Label>
            <Input
              id="wp-url"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://myblog.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wp-user">사용자명</Label>
            <Input
              id="wp-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wp-pass">애플리케이션 비밀번호</Label>
            <Input
              id="wp-pass"
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx"
            />
          </div>
          <div className="space-y-1.5">
            <Label>기본 게시 상태</Label>
            <Select
              value={defaultStatus}
              onValueChange={(v) => setDefaultStatus(v as "draft" | "publish")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">임시글(draft)</SelectItem>
                <SelectItem value="publish">바로 게시(publish)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            연결 확인 후 저장
          </Button>
          {site.data && (
            <Button
              size="sm"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash2 className="mr-1 h-4 w-4" /> 연결 삭제
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
