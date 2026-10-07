import type { CommissionInfo } from "@/lib/commission";

const kes = (n: number) =>
  `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Amount paid → commission → VAT on commission → net amount put on the token. */
export function CommissionBreakdown({ paid, commission }: { paid: number; commission: CommissionInfo | null }) {
  if (!commission) return null;
  const rows: [string, string, boolean?][] = [
    ["Amount paid", kes(paid)],
    [`Commission (${commission.commission_percentage.toFixed(2)}%)`, `− ${kes(commission.commission_amount)}`],
    [`VAT on commission (${commission.vat_on_commission_percentage.toFixed(2)}%)`, `− ${kes(commission.vat_on_commission_amount)}`],
    ["Net amount (token value)", kes(commission.net_amount), true],
  ];
  return (
    <dl className="mt-3 max-w-sm space-y-1 rounded-xl border border-border bg-background/60 p-3 text-sm">
      {rows.map(([label, value, strong]) => (
        <div
          key={label}
          className={`flex justify-between gap-4 ${strong ? "border-t border-border pt-1 font-semibold text-foreground" : "text-muted-foreground"}`}
        >
          <dt>{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
