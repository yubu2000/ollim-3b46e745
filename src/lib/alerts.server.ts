// Server-only alert evaluation + email delivery.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Rule = {
  id: string;
  user_id: string;
  project_id: string;
  email: string;
  enabled: boolean;
  geo_threshold: number;
  mention_delta: number;
  min_interval_hours: number;
  last_sent_at: string | null;
};

async function sendEmail(to: string, subject: string, body: string) {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["ALERT_FROM_EMAIL"] ?? "GEO Radar <onboarding@resend.dev>";
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: `<div style="font-family:system-ui,sans-serif;line-height:1.6">
          <h2 style="margin:0 0 12px">${subject}</h2>
          <p style="white-space:pre-wrap">${body}</p>
          <p style="color:#64748b;font-size:12px">GEO Radar 자동 알림</p>
        </div>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function loadRule(projectId: string): Promise<Rule | null> {
  const { data } = await supabaseAdmin
    .from("alert_rules")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as Rule | null) ?? null;
}

function throttled(rule: Rule) {
  if (!rule.last_sent_at) return false;
  const elapsed = Date.now() - new Date(rule.last_sent_at).getTime();
  return elapsed < rule.min_interval_hours * 3600_000;
}

async function fire(rule: Rule, kind: string, subject: string, message: string) {
  const delivered = await sendEmail(rule.email, subject, message);
  await supabaseAdmin.from("alert_events").insert({
    user_id: rule.user_id,
    project_id: rule.project_id,
    kind,
    message,
    delivered,
  });
  await supabaseAdmin
    .from("alert_rules")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("id", rule.id);
  return delivered;
}

export async function checkAuditAlert(projectId: string, projectName: string, geoScore: number, url: string) {
  const rule = await loadRule(projectId);
  if (!rule || !rule.enabled || throttled(rule)) return;
  if (geoScore >= rule.geo_threshold) return;
  await fire(
    rule,
    "geo_drop",
    `[GEO Radar] ${projectName} GEO 점수 ${geoScore}점 (기준 ${rule.geo_threshold}점 미만)`,
    `진단 대상: ${url}\n현재 GEO 점수: ${geoScore}점\n설정한 기준: ${rule.geo_threshold}점\n\n대시보드에서 실패 항목과 개선 제안을 확인해 주세요.`,
  );
}

export async function checkMentionAlert(
  projectId: string,
  projectName: string,
  currentRate: number,
  previousRate: number | null,
) {
  const rule = await loadRule(projectId);
  if (!rule || !rule.enabled || throttled(rule)) return;
  if (previousRate === null) return;
  const delta = currentRate - previousRate;
  if (Math.abs(delta) < rule.mention_delta) return;
  const dir = delta > 0 ? "상승" : "하락";
  await fire(
    rule,
    delta > 0 ? "mention_up" : "mention_down",
    `[GEO Radar] ${projectName} LLM 멘션률 ${Math.abs(delta)}%p ${dir}`,
    `직전 실행 언급률: ${previousRate}%\n이번 실행 언급률: ${currentRate}%\n변화: ${delta > 0 ? "+" : ""}${delta}%p\n\n멘션 추적 화면에서 모델별 상세 결과를 확인해 주세요.`,
  );
}
