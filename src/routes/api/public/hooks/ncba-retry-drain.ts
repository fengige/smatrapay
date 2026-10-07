import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron entry point for the NCBA retry queue.
 *
 * Security: the caller must present a bearer token that matches the value
 * stored server-side in app_settings under the key `cron_retry_token`.
 * The value never exists in the browser bundle or in this file; pg_cron reads
 * it from the database at execution time. The handler is idempotent and
 * bounded: it only vends payments that are already queued for retry and due,
 * each capped by the queue's own attempt limits.
 */

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/ncba-retry-drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["NCBA_RETRY_CRON_SECRET"];
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
