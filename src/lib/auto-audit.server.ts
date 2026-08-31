// Server-only scheduled audit runner. Invoked by the cron endpoint.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchPage, runChecks, score, summarize } from "./geo-engine.server";
import { assertQuota, consume } from "./billing.server";
import { checkAuditAlert } from "./alerts.server";

type DueProject = {
  id: string;
  user_id: string;
  name: string;
  site_url: string;
  brand_name: string;
  auto_audit_interval_hours: number;
  last_auto_audit_at: string | null;
  gsc_site_url: string | null;
};

export async function runScheduledAudits(limit = 20) {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id, user_id, name, site_url, brand_name, auto_audit_interval_hours, last_auto_audit_at, gsc_site_url")
    .eq("auto_audit_enabled", true)
    .order("last_auto_audit_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const now = Date.now();
  const due = ((data ?? []) as DueProject[]).filter((p) => {
    if (!p.last_auto_audit_at) return true;
    const elapsed = now - new Date(p.last_auto_audit_at).getTime();
    return elapsed >= Math.max(1, p.auto_audit_interval_hours) * 3600_000;
  });

  const results: { project: string; status: "ok" | "skipped" | "failed"; detail?: string }[] = [];

  for (const project of due) {
    try {
      await assertQuota(project.user_id, "audit");

      const { url, html } = await fetchPage(project.site_url);
      const items = await runChecks(url, html);
      const seo = score(items, "SEO");
      const geo = score(items, "GEO");
      const summary = await summarize(url, items, project.brand_name);

      const { data: audit, error: auditError } = await supabaseAdmin
        .from("audits")
        .insert({
          project_id: project.id,
          user_id: project.user_id,
          target_url: url,
          seo_score: seo,
          geo_score: geo,
          status: "completed",
          summary,
        })
        .select("id")
        .single();
      if (auditError) throw new Error(auditError.message);

      const { error: itemsError } = await supabaseAdmin.from("audit_items").insert(
        items.map((i) => ({
          audit_id: audit.id,
          user_id: project.user_id,
          category: i.category,
          title: i.title,
          passed: i.passed,
          severity: i.severity,
          evidence: i.evidence,
          recommendation: i.recommendation,
          weight: i.weight,
        })),
      );
      if (itemsError) throw new Error(itemsError.message);

      // Keep Search Console SEO metrics fresh alongside the audit.
      if (project.gsc_site_url) {
        try {
          const { refreshProjectSnapshot } = await import("./gsc.server");
          await refreshProjectSnapshot(supabaseAdmin as never, project);
        } catch {
          // Search Console is optional — never fail the audit because of it.
        }
      }

      await consume(project.user_id, "audit");
      await checkAuditAlert(project.id, project.name, geo, url);
      await supabaseAdmin
        .from("projects")
        .update({ last_auto_audit_at: new Date().toISOString() })
        .eq("id", project.id);

      results.push({ project: project.name, status: "ok" });
    } catch (e) {
      const detail = e instanceof Error ? e.message : "자동 진단 실패";
      // Quota exhaustion should not retry every hour — push the next attempt out.
      await supabaseAdmin
        .from("projects")
        .update({ last_auto_audit_at: new Date().toISOString() })
        .eq("id", project.id);
      results.push({
        project: project.name,
        status: detail.includes("한도") ? "skipped" : "failed",
        detail,
      });
    }
  }

  return { checked: due.length, results };
}
