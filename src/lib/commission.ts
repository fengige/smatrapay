/** Shared server-side financial rules; resident rounding is intentionally unchanged. */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type CommissionPayer = "owner" | "resident";

export type CommissionBreakdown = {
  gross_amount: number;
  commission_percentage: number;
  commission_amount: number;
  vat_on_commission_percentage: number;
  vat_on_commission_amount: number;
  net_amount: number;
};

/** By value: customer pays `gross`; commission + VAT come out; the rest is tokenized. */
export function deductCommission(gross: number, commissionPct: number, vatPct: number): CommissionBreakdown {
  const commission = r2((gross * commissionPct) / 100);
  const vat = r2((commission * vatPct) / 100);
  return {
    gross_amount: r2(gross),
    commission_percentage: commissionPct,
    commission_amount: commission,
    vat_on_commission_percentage: vatPct,
    vat_on_commission_amount: vat,
    net_amount: r2(gross - commission - vat),
  };
}

/** By units: the token value is fixed, so the payment is grossed up to cover commission + VAT. */
export function grossUpForUnits(net: number, commissionPct: number, vatPct: number): CommissionBreakdown {
  const rate = (commissionPct / 100) * (1 + vatPct / 100);
  const gross = rate >= 1 ? net : r2(net / (1 - rate));
  const b = deductCommission(gross, commissionPct, vatPct);
  // Absorb rounding into commission so net stays exactly the token value.
  const drift = r2(b.net_amount - net);
  return { ...b, commission_amount: r2(b.commission_amount + drift), net_amount: r2(net) };
}

/** Commission is a percentage of payment; VAT is a percentage of that commission. */
export function calculateTokenCommission(
  amount: number, commissionPct: number, vatPct: number, payer: CommissionPayer,
  byUnits = false,
): CommissionBreakdown & { commission_payer: CommissionPayer } {
  if (payer !== "owner" && payer !== "resident") throw new Error("Choose who pays commission");
  if (![commissionPct, vatPct].every(n => Number.isFinite(n) && n >= 0 && n <= 100))
    throw new Error("Commission and VAT percentages must be between 0 and 100");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive purchase amount");
  const breakdown = payer === "resident" && byUnits
    ? grossUpForUnits(amount, commissionPct, vatPct)
    : deductCommission(amount, commissionPct, vatPct);
  return { ...breakdown, commission_payer: payer, net_amount: payer === "owner" ? r2(amount) : breakdown.net_amount };
}

/** Breakdown stored on a token sale; null for older sales and non-credit actions. */
export type CommissionInfo = {
  commission_payer: CommissionPayer;
  net_amount: number;
  commission_percentage: number;
  commission_amount: number;
  vat_on_commission_percentage: number;
  vat_on_commission_amount: number;
};

export function commissionFromRow(r: any): CommissionInfo | null {
  if (r?.net_amount == null) return null;
  return {
    commission_payer: r.commission_payer === "owner" ? "owner" : "resident",
    net_amount: Number(r.net_amount),
    commission_percentage: Number(r.commission_percentage ?? 0),
    commission_amount: Number(r.commission_amount ?? 0),
    vat_on_commission_percentage: Number(r.vat_on_commission_percentage ?? 0),
    vat_on_commission_amount: Number(r.vat_on_commission_amount ?? 0),
  };
}
