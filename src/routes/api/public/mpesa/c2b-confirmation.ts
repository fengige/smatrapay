import { createFileRoute } from "@tanstack/react-router";

/** Daraja C2B confirmation callback: records the confirmed payment. */
export const Route = createFileRoute("/api/public/mpesa/c2b-confirmation")({
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
          flow: "c2b",
          transaction_id: payload?.TransID ?? null,
          mpesa_receipt_number: payload?.TransID ?? null,
          phone_number: payload?.MSISDN ? String(payload.MSISDN) : null,
          amount: payload?.TransAmount ?? null,
          account_reference: payload?.BillRefNumber ?? null,
          status: "completed",
          result_code: "0",
          result_desc: "C2B confirmation received",
          callback_payload: payload,
        } as never);

        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});
