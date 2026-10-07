import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron entry point for the NCBA retry queue.
 *
 * Security: the caller must present a bearer token that matches the value
 * stored server-side in `cron_settings` under the key `ncba_retry_drain_token`.
 * That value is generated in the database and never leaves it — it is not in
 * the browser bundle, not in this file, and not readable through the public
 * API (the table has no access rules for app users). The pg_cron job reads it
 * from the database at execution time. The handler is idempotent and bounded:
 * it only vends payments that are already queued for retry and due, each
 * capped by the queue's own attempt limits (5 attempts with backoff; timeouts
 * need admin review).
 */

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function expectedToken(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("cron_settings")
    .select("value")
    .eq("key", "ncba_retry_drain_token")
    .maybeSingle();
  return (data?.value as string) ?? null;
}

export const Route = createFileRoute("/api/public/hooks/ncba-retry-drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = await expectedToken();
        const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        if (!expected || !provided || !safeEqual(provided, expected)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { processDueNcbaRetries } = await import("@/lib/ncba.server");
        const results = await processDueNcbaRetries(5);
        const completed = results.filter((r) => r.status === "completed").length;
        return Response.json(
          { ok: true, processed: results.length, completed },
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
