// Server-only Google Search Console access through the Lovable connector gateway.

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

export type GscQueryRow = { query: string; clicks: number; impressions: number; ctr: number; position: number };
export type GscPageRow = { page: string; clicks: number; impressions: number; ctr: number; position: number };

export type GscSnapshot = {
  siteUrl: string;
  periodStart: string;
  periodEnd: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: GscQueryRow[];
  topPages: GscPageRow[];
};

function headers() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"];
  if (!lovableKey || !connKey)
    throw new Error("Google Search Console 연결이 설정되지 않았습니다. 커넥터를 연결해 주세요.");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
  };
}

export function gscConfigured() {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"]);
}

function coversTarget(siteUrl: string, target: URL) {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    const host = target.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    const prefix = new URL(siteUrl);
    return target.href.startsWith(prefix.href) || target.origin === prefix.origin;
  } catch {
    return false;
  }
}

type SiteEntry = { siteUrl: string; permissionLevel?: string };

export async function listVerifiedSites(): Promise<SiteEntry[]> {
  const res = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Search Console 속성 목록을 불러오지 못했습니다 [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { siteEntry?: SiteEntry[] };
  return (json.siteEntry ?? []).filter((e) => e.permissionLevel !== "siteUnverifiedUser");
}

/** Verified properties that cover the given site URL. */
export async function matchingSites(targetUrl: string) {
  const sites = await listVerifiedSites();
  let target: URL;
  try {
    target = new URL(targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`);
  } catch {
    return { all: sites.map((s) => s.siteUrl), matches: [] as string[] };
  }
  return {
    all: sites.map((s) => s.siteUrl),
    matches: sites.filter((s) => coversTarget(s.siteUrl, target)).map((s) => s.siteUrl),
  };
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function query(siteUrl: string, body: Record<string, unknown>) {
  const res = await fetch(
    `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (res.status === 403)
    throw new Error("연결된 Google 계정이 이 Search Console 속성에 접근할 수 없습니다.");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search Console 조회 실패 [${res.status}]: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[] };
  return json.rows ?? [];
}

/** Latest 28 complete days (Search Console data lags ~3 days). */
export async function fetchSnapshot(siteUrl: string): Promise<GscSnapshot> {
  const end = new Date(Date.now() - 3 * 86400_000);
  const start = new Date(end.getTime() - 27 * 86400_000);
  const range = { startDate: ymd(start), endDate: ymd(end) };

  const [totals, queries, pages] = await Promise.all([
    query(siteUrl, { ...range, dimensions: [], rowLimit: 1 }),
    query(siteUrl, { ...range, dimensions: ["query"], rowLimit: 25 }),
    query(siteUrl, { ...range, dimensions: ["page"], rowLimit: 15 }),
  ]);

  const t = totals[0];
  return {
    siteUrl,
    periodStart: range.startDate,
    periodEnd: range.endDate,
    clicks: Math.round(t?.clicks ?? 0),
    impressions: Math.round(t?.impressions ?? 0),
    ctr: Math.round((t?.ctr ?? 0) * 10000) / 100,
    position: Math.round((t?.position ?? 0) * 10) / 10,
    topQueries: queries.map((r) => ({
      query: r.keys?.[0] ?? "",
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: Math.round((r.ctr ?? 0) * 10000) / 100,
      position: Math.round((r.position ?? 0) * 10) / 10,
    })),
    topPages: pages.map((r) => ({
      page: r.keys?.[0] ?? "",
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: Math.round((r.ctr ?? 0) * 10000) / 100,
      position: Math.round((r.position ?? 0) * 10) / 10,
    })),
  };
}

type MinimalClient = {
  from: (table: string) => {
    upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

/** Fetch + persist the snapshot for one project. */
export async function refreshProjectSnapshot(
  client: MinimalClient,
  project: { id: string; user_id: string; gsc_site_url: string | null },
) {
  if (!project.gsc_site_url) throw new Error("먼저 Search Console 속성을 선택해 주세요.");
  const snapshot = await fetchSnapshot(project.gsc_site_url);
  const { error } = await client.from("search_console_snapshots").upsert(
    {
      project_id: project.id,
      user_id: project.user_id,
      site_url: snapshot.siteUrl,
      period_start: snapshot.periodStart,
      period_end: snapshot.periodEnd,
      clicks: snapshot.clicks,
      impressions: snapshot.impressions,
      ctr: snapshot.ctr,
      position: snapshot.position,
      top_queries: snapshot.topQueries,
      top_pages: snapshot.topPages,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
  if (error) throw new Error(error.message);
  return snapshot;
}
