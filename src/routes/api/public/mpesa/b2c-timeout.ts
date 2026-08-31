import { createFileRoute } from "@tanstack/react-router";

/** Daraja B2C queue timeout callback. */
export const Route = createFileRoute("/api/public/mpesa/b2c-timeout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any = null;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("mpesa_transactions").insert({
          flow: "b2c",
          status: "failed",
          result_desc: "B2C request timed out in the queue",
          callback_payload: payload,
        } as never);

        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});
