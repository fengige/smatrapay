import { createFileRoute } from "@tanstack/react-router";

/** Sidian Bank C2B confirmation (public; Basic Auth checked in-handler against the meter owner's Sidian settings). */
export const Route = createFileRoute("/api/public/sidian/notification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { ack } = await import("@/lib/ncba.server");
        const { checkSidianPayload, matchSidianAuth, processSidianNotification, resolveSidianConfig, sidianPayload } =
          await import("@/lib/sidian.server");

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return ack("1", "Invalid JSON", 400);
        }
        const parsed = sidianPayload.safeParse(body);
        if (!parsed.success) return ack("1", "Invalid request", 400);
        const d = parsed.data.ConfirmationRequest.data;

        let resolved;
        try {
          resolved = await resolveSidianConfig(d.Account, d.BusinessShortCode);
        } catch {
          return ack("1", "Temporary error — retry later", 500);
        }
        if (resolved.kind === "none") return ack("1", "Service not configured", 503);
        if (resolved.kind === "disabled") return ack("1", "Sidian Bank payments are disabled for this account", 403);

        const cfg = matchSidianAuth(request.headers.get("authorization"), resolved.configs);
        if (!cfg) return ack("1", "Unauthorized", 401);

        const err = checkSidianPayload(parsed.data, cfg);
        if (err === "TRANS_TYPE_UNSUPPORTED") return ack("1", "Unsupported transaction type", 400);
        if (err === "SHORTCODE_INVALID") return ack("1", "Unauthorized", 401);
        if (err === "AMOUNT_INVALID") return ack("1", "Invalid amount", 400);

        try {
          return await processSidianNotification(parsed.data);
        } catch {
          return ack("1", "Temporary error — retry later", 500);
        }
      },
    },
  },
});
