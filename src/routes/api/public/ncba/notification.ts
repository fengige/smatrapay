import { createFileRoute } from "@tanstack/react-router";

/** NCBA Pay Bill payment notification (public; authenticated in-handler). */
export const Route = createFileRoute("/api/public/ncba/notification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { ack, checkNcbaAuth, ncbaPayload, parseNcbaAmount, processNcbaNotification } = await import(
          "@/lib/ncba.server"
        );
        const cfg = {
          username: process.env["NCBA_USERNAME"] ?? "",
          password: process.env["NCBA_PASSWORD"] ?? "",
          hash: process.env["NCBA_HASH"] ?? "",
          shortcode: process.env["NCBA_SHORTCODE"] ?? "",
        };
        if (!cfg.username || !cfg.password || !cfg.hash || !cfg.shortcode)
          return ack("1", "Service not configured", 503);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return ack("1", "Invalid JSON", 400);
        }
        const parsed = ncbaPayload.safeParse(body);
        if (!parsed.success) return ack("1", "Invalid request", 400);

        const authError = checkNcbaAuth(parsed.data, cfg);
        if (authError) return ack("1", authError === "TRANS_TYPE_UNSUPPORTED" ? "Unsupported transaction type" : "Unauthorized", authError === "TRANS_TYPE_UNSUPPORTED" ? 400 : 401);

        const amount = parseNcbaAmount(parsed.data.TransAmount);
        if (amount === null) return ack("1", "Invalid amount", 400);

        try {
          return await processNcbaNotification(parsed.data, amount);
        } catch {
          return ack("1", "Temporary error — retry later", 500);
        }
      },
    },
  },
});
