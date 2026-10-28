import { paygProgress, type PaygPlanView } from "./payg-payment";

/** Caller must authorize resident access first; every read remains resident-bound. */
export async function readResidentPaygPlans(db: any, residentId: string): Promise<PaygPlanView[]> {
  const { data: plans, error } = await db.from("payg_plans")
    .select("id,product_id,product_name,down_payment_cents,instalment_cents,instalment_count,frequency,total_cents")
    .eq("resident_id", residentId).order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your plans.");
  const ids = (plans ?? []).map((p: any) => p.id);
  const { data: attempts, error: paymentError } = ids.length
    ? await db.from("payg_payment_attempts").select("id,plan_id,amount_cents,status,receipt,error_message,created_at")
      .eq("resident_id", residentId).in("plan_id", ids).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (paymentError) throw new Error("Could not load payment progress.");
  return (plans ?? []).map((p: any) => {
    const payments = (attempts ?? []).filter((a: any) => a.plan_id === p.id)
      .map(({ plan_id, ...a }: any) => ({ ...a, amount_cents: Number(a.amount_cents) }));
    return { ...p, down_payment_cents: Number(p.down_payment_cents), instalment_cents: Number(p.instalment_cents),
      total_cents: Number(p.total_cents), ...paygProgress(p, payments), payments };
  });
}