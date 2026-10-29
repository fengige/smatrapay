import { Package } from "lucide-react";
import type { ReactNode } from "react";
import type { PaygProduct } from "@/lib/payg";
import { DEFAULT_PAYG_SUMMARY } from "@/lib/payg-summary";

const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function PaygHowItWorks({ summary = DEFAULT_PAYG_SUMMARY, vendorName }: { summary?: string; vendorName?: string | null }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-sm text-foreground">
      {vendorName && <h2 className="mb-3 font-semibold">{vendorName}</h2>}
      <p className="whitespace-pre-wrap break-words">{summary}</p>
    </section>
  );
}

export function PaygGrid({ products, empty, actions }: { products: PaygProduct[]; empty: string; actions?: (p: PaygProduct) => ReactNode }) {
  if (!products.length) return <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => {
        const details: [string, string][] = [];
        if (p.price !== null) details.push(["Price", kes(p.price)]);
        if (p.down_payment !== null) details.push(["Down payment", kes(p.down_payment)]);
        if (p.instalment_amount !== null) details.push(["Instalment", `${kes(p.instalment_amount)}${p.instalment_frequency ? ` / ${p.instalment_frequency.replace("ly", "").replace("dai", "day")}` : ""}`]);
        if (p.instalment_count !== null) details.push(["Instalments", String(p.instalment_count)]);
        return (
          <article key={p.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex aspect-video items-center justify-center bg-muted">
              {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" loading="lazy" /> : <Package className="h-10 w-10 text-muted-foreground" aria-hidden />}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground">{p.name}</h3>
                {!p.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Hidden</span>}
              </div>
              {p.vendor_name && <p className="text-xs text-muted-foreground">Offered by {p.vendor_name}</p>}
              {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
              {details.length > 0 && (
                <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 pt-2 text-sm">
                  {details.map(([k, v]) => (<div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium text-foreground">{v}</dd></div>))}
                </dl>
              )}
              {actions && <div className="flex gap-2 pt-2">{actions(p)}</div>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
