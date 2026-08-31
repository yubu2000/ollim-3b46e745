// Server-only: publish a generated draft to a connected WordPress blog.
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
  return `${mdToHtml(opts.markdown)}\n${faqHtml}${ld}`;
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
    throw new Error("WordPress 연결이 아직 설정되지 않았습니다. 연결 후 다시 시도해 주세요.");
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
    console.error(`WordPress publish failed [${res.status}]: ${body}`);
    throw new Error(`WordPress 게시 실패 [${res.status}]: ${body.slice(0, 400)}`);
  }

  const post = (await res.json()) as { id?: number; link?: string; status?: string };
  return { id: post.id ?? null, link: post.link ?? null, status: post.status ?? opts.status };
}
