import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

function ownSecretOk(request: Request) {
  const secret = process.env["AUTO_AUDIT_CRON_SECRET"];
  if (!secret) return false;
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  return Boolean(token) && token === secret;
}

async function handle(request: Request) {
  if (!ownSecretOk(request)) {
    const denied = await authenticateCronRequest(request);
    if (denied) return denied;
  }

  const { runScheduledAudits } = await import("@/lib/auto-audit.server");
  try {
    const result = await runScheduledAudits();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "자동 진단 실행 실패";
    console.error("auto-audit cron failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/auto-audit")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
