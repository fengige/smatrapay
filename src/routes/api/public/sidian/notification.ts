import { createFileRoute } from "@tanstack/react-router";

/** Sidian Bank C2B confirmation (public; Basic Auth checked in-handler). */
export const Route = createFileRoute("/api/public/sidian/notification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { ack } = await import("@/lib/ncba.server");
        const { checkSidianAuth, checkSidianPayload, processSidianNotification, sidianPayload } = await import(
          "@/lib/sidian.server"
        );
        const cfg = {
          username: process.env["SIDIAN_USERNAME"] ?? "",
          password: process.env["SIDIAN_PASSWORD"] ?? "",
          shortcode: process.env["SIDIAN_SHORTCODE"] ?? "",
        };
        if (!cfg.username || !cfg.password || !cfg.shortcode) return ack("1", "Service not configured", 503);
        if (!checkSidianAuth(request.headers.get("authorization"), cfg)) return ack("1", "Unauthorized", 401);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return ack("1", "Invalid JSON", 400);
        }
        const parsed = sidianPayload.safeParse(body);
        if (!parsed.success) return ack("1", "Invalid request", 400);
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
