/**
 * Server-only: completes a resident token purchase after M-Pesa confirms payment.
 * Every step is compare-and-set so duplicate callbacks or retries never vend twice.
 */
export async function completeResidentPurchase(checkoutRequestId: string, success: boolean, receipt: string | null, resultDesc: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: p } = await db.from("resident_token_purchases").select("*").eq("checkout_request_id", checkoutRequestId).maybeSingle();
  if (!p) return;
  if (!success) {
    await db.from("resident_token_purchases")
      .update({ status: "payment_failed", error_message: resultDesc || "The M-Pesa payment was not completed." })
      .eq("id", p.id).eq("status", "pending_payment");
    await notifyResident(db, p.resident_id, "Payment not completed", resultDesc || "Your M-Pesa token payment was not completed. You have not been charged.", p.id);
    return;
  }
  const { data: claimed } = await db.from("resident_token_purchases")
    .update({ status: "paid", mpesa_receipt_number: receipt })
    .eq("id", p.id).eq("status", "pending_payment").select("id");
  if (!claimed?.length) return; // already handled by an earlier callback
  await vendResidentPurchase(p.id);
}

export async function vendResidentPurchase(purchaseId: string): Promise<{ status: string; message: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  // Claim: only a paid or failed-vend purchase may move to vending.
  const { data: rows } = await db.from("resident_token_purchases")
    .update({ status: "vending", error_message: null })
    .eq("id", purchaseId).in("status", ["paid", "vend_failed"]).select("*");
  const p = rows?.[0];
  if (!p) return { status: "skipped", message: "This purchase is not waiting for a token." };
  try {
    const { vendMeterToken } = await import("@/lib/vending/vend.server");
    const { row } = await vendMeterToken(db, {
      meterId: p.meter_id, action: "credit", units: 0, amount: Number(p.amount), vendByUnit: false,
      reference: p.mpesa_receipt_number, customerPhone: p.phone, smsRequested: true, expiresInDays: 30,
      actorId: null,
      // One key per purchase: the token is generated at most once, however often this runs.
      requestId: `resident:${p.id}`,
    });
    await db.from("resident_token_purchases").update({ status: "vended", token_id: row.id }).eq("id", p.id);
    await notifyResident(db, p.resident_id, "Token ready", `Your token purchase of KES ${p.amount} is ready.`, p.id);
    try {
      const { sendTokenReceiptSms } = await import("@/lib/sms-receipt.server");
      await sendTokenReceiptSms(db, { tokenId: row.id, phone: p.phone, actorId: null });
    } catch { /* SMS problems never undo a sale */ }
    return { status: "vended", message: null };
  } catch (e) {
    const msg = (e as Error).message || "Token generation failed";
    await db.from("resident_token_purchases").update({ status: "vend_failed", error_message: msg }).eq("id", p.id);
    await notifyResident(db, p.resident_id, "Token delayed", "We received your payment but the token is not ready yet. You can retry from My Token Purchases without paying again.", p.id);
    return { status: "vend_failed", message: msg };
  }
}

async function notifyResident(db: any, userId: string, title: string, message: string, id: string) {
  try {
    await db.from("notifications").insert({ user_id: userId, type: "token_purchase", title, message, resource_type: "resident_token_purchase", resource_id: id });
  } catch { /* never block payment flow */ }
}
