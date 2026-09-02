// Server-only: publish a generated draft to a connected blog.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/wordpress";

function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  const inline = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = Math.min(6, Math.max(2, h[1]!.length));
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}

export function articleToHtml(opts: {
  title: string;
  markdown: string;
  faq: { question: string; answer: string }[];
  jsonld?: unknown;
  images?: { url: string; alt?: string }[];
}): string {
  const faqHtml =
    opts.faq.length > 0
      ? `<h2>자주 묻는 질문</h2>\n` +
        opts.faq
          .map((f) => `<h3>${f.question}</h3>\n<p>${f.answer}</p>`)
          .join("\n")
      : "";
  const ld = opts.jsonld
    ? `\n<script type="application/ld+json">\n${JSON.stringify(opts.jsonld, null, 2)}\n</script>`
    : "";

  let body = mdToHtml(opts.markdown);
  const images = opts.images ?? [];
  if (images.length > 0) {
    const figure = (img: { url: string; alt?: string }) =>
      `<figure><img src="${img.url}" alt="${(img.alt ?? opts.title).replace(/"/g, "&quot;")}" loading="lazy" /></figure>`;
    // 첫 이미지는 본문 맨 위, 나머지는 h2 구간 사이에 나눠 삽입한다.
    body = `${figure(images[0]!)}\n${body}`;
    const rest = images.slice(1);
    if (rest.length > 0) {
      const parts = body.split(/(?=<h2>)/);
      const out: string[] = [];
      let i = 0;
      for (const part of parts) {
        out.push(part);
        if (i < rest.length && part.startsWith("<h2>")) out.push(figure(rest[i++]!));
      }
      for (; i < rest.length; i++) out.push(figure(rest[i]!));
      body = out.join("\n");
    }
  }

  return `${body}\n${faqHtml}${ld}`;
}

export type UserWpSite = { site_url: string; username: string; app_password: string };

function wpBase(siteUrl: string) {
  const trimmed = siteUrl.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return `${withScheme}/wp-json/wp/v2`;
}

function wpAuth(site: UserWpSite) {
  const token = btoa(`${site.username.trim()}:${site.app_password.trim()}`);
  return `Basic ${token}`;
}

async function wpFetch(site: UserWpSite, path: string, init: RequestInit) {
  const res = await fetch(`${wpBase(site.site_url)}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: wpAuth(site) },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Blog request failed [${res.status}] ${path}: ${body.slice(0, 500)}`);
    throw new Error(`블로그 요청 실패 [${res.status}]: ${body.slice(0, 300)}`);
  }
  return res;
}

/** Confirm the stored credentials can actually authenticate. */
export async function testUserSite(site: UserWpSite) {
  const res = await wpFetch(site, "/users/me?context=edit", { method: "GET" });
  const me = (await res.json()) as { name?: string; slug?: string };
  return { ok: true, name: me.name ?? me.slug ?? site.username };
}

/** Upload a base64 data URL (or remote image URL) into the member's blog media library. */
export async function uploadMediaToUserSite(
  site: UserWpSite,
  image: { dataUrl?: string; url?: string; filename?: string; alt?: string },
): Promise<{ id: number; url: string; alt: string }> {
  let bytes: Uint8Array;
  let mime = "image/png";

  if (image.dataUrl?.startsWith("data:")) {
    const [head, b64] = image.dataUrl.split(",");
    mime = head?.match(/data:([^;]+)/)?.[1] ?? mime;
    const bin = atob(b64 ?? "");
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } else if (image.url) {
    const r = await fetch(image.url);
    if (!r.ok) throw new Error(`이미지를 불러오지 못했습니다 [${r.status}]`);
    mime = r.headers.get("content-type") ?? mime;
    bytes = new Uint8Array(await r.arrayBuffer());
  } else {
    throw new Error("업로드할 이미지 데이터가 없습니다.");
  }

  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const filename = (image.filename ?? `image-${Date.now()}`).replace(/[^\w.-]/g, "-") + `.${ext}`;

  const res = await wpFetch(site, "/media", {
    method: "POST",
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: bytes as unknown as BodyInit,
  });
  const media = (await res.json()) as { id: number; source_url: string };

  if (image.alt) {
    try {
      await wpFetch(site, `/media/${media.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alt_text: image.alt }),
      });
    } catch {
      // alt 갱신 실패는 게시를 막지 않는다.
    }
  }

  return { id: media.id, url: media.source_url, alt: image.alt ?? "" };
}

/** Publish to the member's own blog with their application password. */
export async function publishToUserSite(
  site: UserWpSite,
  opts: {
    title: string;
    contentHtml: string;
    excerpt?: string;
    status: "draft" | "publish";
    featuredMediaId?: number;
  },
) {
  const res = await wpFetch(site, "/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: opts.title,
      content: opts.contentHtml,
      excerpt: opts.excerpt ?? "",
      status: opts.status,
      ...(opts.featuredMediaId ? { featured_media: opts.featuredMediaId } : {}),
    }),
  });
  const post = (await res.json()) as { id?: number; link?: string; status?: string };
  return { id: post.id ?? null, link: post.link ?? null, status: post.status ?? opts.status };
}


export function wordpressConfigured() {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["WORDPRESS_API_KEY"]);
}

export async function publishPost(opts: {
  title: string;
  contentHtml: string;
  excerpt?: string;
  status: "draft" | "publish";
}) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const wpKey = process.env["WORDPRESS_API_KEY"];
  if (!lovableKey || !wpKey) {
    throw new Error("블로그 연결이 아직 설정되지 않았습니다. 연결 후 다시 시도해 주세요.");
  }

  const res = await fetch(`${GATEWAY_URL}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": wpKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: opts.title,
      content: opts.contentHtml,
      excerpt: opts.excerpt ?? "",
      status: opts.status,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Blog publish failed [${res.status}]: ${body}`);
    throw new Error(`블로그 게시 실패 [${res.status}]: ${body.slice(0, 400)}`);
  }

  const post = (await res.json()) as { id?: number; link?: string; status?: string };
  return { id: post.id ?? null, link: post.link ?? null, status: post.status ?? opts.status };
}
