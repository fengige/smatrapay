/** Commission and VAT on commission are deducted from what the customer pays. */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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

/** Breakdown stored on a token sale; null for older sales and non-credit actions. */
export type CommissionInfo = {
  net_amount: number;
  commission_percentage: number;
  commission_amount: number;
  vat_on_commission_percentage: number;
  vat_on_commission_amount: number;
};

export function commissionFromRow(r: any): CommissionInfo | null {
  if (r?.net_amount == null) return null;
  return {
    net_amount: Number(r.net_amount),
    commission_percentage: Number(r.commission_percentage ?? 0),
    commission_amount: Number(r.commission_amount ?? 0),
    vat_on_commission_percentage: Number(r.vat_on_commission_percentage ?? 0),
    vat_on_commission_amount: Number(r.vat_on_commission_amount ?? 0),
  };
}
