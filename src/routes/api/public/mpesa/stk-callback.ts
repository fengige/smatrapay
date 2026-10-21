import { createFileRoute } from "@tanstack/react-router";

/**
 * Daraja STK Push result callback. Safaricom posts here; the transaction is only
 * marked successful when ResultCode is 0.
 */
export const Route = createFileRoute("/api/public/mpesa/stk-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any = null;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        const cb = payload?.Body?.stkCallback ?? {};
        const checkoutRequestId = cb.CheckoutRequestID ?? null;
        const resultCode = cb.ResultCode;
        const items: any[] = cb.CallbackMetadata?.Item ?? [];
        const item = (name: string) => items.find((i) => i?.Name === name)?.Value ?? null;

        if (checkoutRequestId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const rawDate = item("TransactionDate");
          let transactionDate: string | null = null;
          if (rawDate) {
            const s = String(rawDate);
            transactionDate = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}+03:00`;
          }
          const success = String(resultCode) === "0";

          const { data: tx } = await supabaseAdmin
            .from("mpesa_transactions")
            .select("id, payment_id")
            .eq("checkout_request_id", checkoutRequestId)
            .maybeSingle();

          const update = {
            result_code: resultCode != null ? String(resultCode) : null,
            result_desc: cb.ResultDesc ?? null,
            mpesa_receipt_number: item("MpesaReceiptNumber"),
            transaction_date: transactionDate,
            phone_number: item("PhoneNumber") ? String(item("PhoneNumber")) : undefined,
            amount: item("Amount") ?? undefined,
            status: success ? "completed" : "failed",
            callback_payload: payload,
          } as any;

          if (tx?.id) {
            await supabaseAdmin.from("mpesa_transactions").update(update).eq("id", tx.id);
            if (success && tx.payment_id) {
              await supabaseAdmin
                .from("payments")
                .update({ status: "completed", paid_at: new Date().toISOString() } as never)
                .eq("id", tx.payment_id);
            }
          } else {
            await supabaseAdmin.from("mpesa_transactions").insert({
              ...update,
              flow: "stk",
              checkout_request_id: checkoutRequestId,
              merchant_request_id: cb.MerchantRequestID ?? null,
            } as never);
          }
        }

        if (checkoutRequestId) {
          try {
            const { completeResidentPurchase } = await import("@/lib/resident-purchase.server");
            await completeResidentPurchase(
              checkoutRequestId,
              String(resultCode) === "0",
              item("MpesaReceiptNumber") ? String(item("MpesaReceiptNumber")) : null,
              cb.ResultDesc ?? null,
            );
          } catch {
            /* Payment is already recorded; vending can be retried. */
          }
        }

        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});
