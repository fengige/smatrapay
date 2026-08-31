import { createFileRoute } from "@tanstack/react-router";

/** Daraja B2C result callback. */
export const Route = createFileRoute("/api/public/mpesa/b2c-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any = null;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        const result = payload?.Result ?? {};
        const params: any[] = result?.ResultParameters?.ResultParameter ?? [];
        const param = (key: string) => params.find((p) => p?.Key === key)?.Value ?? null;
        const success = String(result.ResultCode) === "0";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("mpesa_transactions").insert({
          flow: "b2c",
          transaction_id: result.TransactionID ?? null,
          mpesa_receipt_number: result.TransactionID ?? null,
          phone_number: param("ReceiverPartyPublicName")
            ? String(param("ReceiverPartyPublicName"))
            : null,
          amount: param("TransactionAmount"),
          result_code: result.ResultCode != null ? String(result.ResultCode) : null,
          result_desc: result.ResultDesc ?? null,
          status: success ? "completed" : "failed",
          callback_payload: payload,
        } as never);

        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});
