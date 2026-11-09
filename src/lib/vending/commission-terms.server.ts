import { calculateTokenCommission } from "@/lib/commission";
import { truncateUnits, unitsFromAmount } from "@/lib/token-units";
import { resolveMeterOwner } from "@/lib/sms-receipt.server";

/** Resolve current terms once, before payment/provider work; never accepts caller rates. */
export async function currentCommissionTerms(db: any, meter: any, amount: number, byUnits = false, units = 0) {
  const { data: defaults, error } = await db.from("pricing_settings")
    .select("commission_payer, commission_percentage, vat_on_commission_percentage").maybeSingle();
  if (error) throw new Error("Could not load commission settings");
  const price = Number(meter.price_per_unit ?? 0);
  const tokenUnits = truncateUnits(units);
  const basis = byUnits ? Math.round(tokenUnits * price * 100) / 100 : amount;
  const breakdown = calculateTokenCommission(basis,
    Number(meter.commission_percentage ?? defaults?.commission_percentage ?? 0),
    Number(meter.vat_on_commission_percentage ?? defaults?.vat_on_commission_percentage ?? 0),
    defaults?.commission_payer ?? "resident", byUnits);
  if (breakdown.net_amount <= 0) throw new Error("The amount is too small to cover the commission and VAT. Enter a larger amount.");
  const owner = resolveMeterOwner(meter);
  if (breakdown.commission_payer === "owner" && !owner)
    throw new Error("This meter needs an owner before owner-paid commission can be recorded.");
  let ownerName: string | null = null;
  if (owner) {
    const { data: user, error: ownerError } = await db.from("users").select("name, email").eq("id", owner.id).maybeSingle();
    if (ownerError || !user) throw new Error("Could not resolve the meter owner account");
    ownerName = user.name ?? user.email ?? null;
  }
  return { ...breakdown, meter_id: meter.id, price_per_unit: price,
    token_units: byUnits ? tokenUnits : price > 0 ? unitsFromAmount(breakdown.net_amount, price) : tokenUnits,
    vend_by_unit: byUnits, owner_id: owner?.id ?? null, owner_type: owner?.type ?? null, owner_name: ownerName };
}

/** Durable, immutable, service-only snapshot. Conflict reads retain the first attempt's terms. */
export async function prepareCommissionTerms(db: any, meter: any, key: string, amount: number, byUnits = false, units = 0) {
  const validate = (snapshot: any) => {
    if (snapshot.meter_id !== meter.id || snapshot.vend_by_unit !== byUnits)
      throw new Error("Purchase terms belong to a different meter or purchase mode");
    if (byUnits ? Number(snapshot.token_units) !== truncateUnits(units)
      : Number(snapshot.gross_amount) !== Math.round((amount + Number.EPSILON) * 100) / 100)
      throw new Error("Purchase amount or units changed; start a new purchase");
    return snapshot;
  };
  const { data: existing, error: readError } = await db.from("vending_commission_terms").select("*").eq("request_key", key).maybeSingle();
  if (readError) throw new Error("Could not load purchase commission terms");
  if (existing) return validate(existing);
  const terms = await currentCommissionTerms(db, meter, amount, byUnits, units);
  const { data, error } = await db.from("vending_commission_terms").insert({ ...terms, request_key: key }).select("*").single();
  if (!error && data) return data;
  if (error?.code === "23505") {
    const { data: first } = await db.from("vending_commission_terms").select("*").eq("request_key", key).maybeSingle();
    if (first) return validate(first);
  }
  throw new Error("Could not preserve purchase commission terms");
}