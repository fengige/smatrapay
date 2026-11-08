import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { getCommissionSettings, saveCommissionSettings } from "@/lib/prices.functions";
import { Button } from "@/components/ui/button";
import type { CommissionPayer } from "@/lib/commission";

type Key = "commission_percentage" | "vat_on_commission_percentage";
const LABELS: Record<Key, string> = {
  commission_percentage: "Commission (%)",
  vat_on_commission_percentage: "VAT on Commission (%)",
};

function check(v: string): string | null {
  if (!v.trim()) return "Enter a percentage";
  const n = Number(v);
  if (!Number.isFinite(n)) return "Enter a number, e.g. 5 or 2.5";
  if (n < 0) return "Percentage cannot be negative";
  if (n > 100) return "Percentage cannot be more than 100%";
  return null;
}

export function CommissionSettingsCard() {
  const qc = useQueryClient();
  const load = useServerFn(getCommissionSettings);
  const save = useServerFn(saveCommissionSettings);
  const { data, isLoading, isError } = useQuery({ queryKey: ["commission-settings"], queryFn: () => load() });
  const [form, setForm] = useState<Record<Key, string>>({ commission_percentage: "", vat_on_commission_percentage: "" });
  const [touched, setTouched] = useState(false);
  const [payer, setPayer] = useState<CommissionPayer | "">("");

  const reset = () => {
    if (!data) return;
    setPayer(data.commission_payer);
    setForm({
      commission_percentage: data.commission_percentage.toFixed(2),
      vat_on_commission_percentage: data.vat_on_commission_percentage.toFixed(2),
    });
    setTouched(false);
  };
  useEffect(reset, [data]);

  const errors = { commission_percentage: check(form.commission_percentage), vat_on_commission_percentage: check(form.vat_on_commission_percentage) };
  const dirty =
    !!data &&
    (payer !== data.commission_payer || Number(form.commission_percentage) !== data.commission_percentage ||
      Number(form.vat_on_commission_percentage) !== data.vat_on_commission_percentage);

  const mutation = useMutation({
    mutationFn: () =>
      {
        if (!payer) throw new Error("Choose who pays commission");
        return save({
        data: {
          commission_payer: payer,
          commission_percentage: Number(form.commission_percentage),
          vat_on_commission_percentage: Number(form.vat_on_commission_percentage),
        },
      }); },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["commission-settings"] });
      toast.success("Commission settings saved");
    },
    onError: (e: Error) => toast.error(e.message || "Could not save commission settings"),
  });

  return (
    <section className="my-4 border-y border-border py-5">
      <h2 className="text-sm font-bold text-foreground">Commission Configuration</h2>

      {isLoading ? (
        <div className="mt-4 h-20 animate-pulse rounded-xl bg-secondary/40" />
      ) : isError ? (
        <p className="mt-4 text-sm text-destructive">Could not load commission settings.</p>
      ) : (
        <form
          noValidate
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!payer || errors.commission_percentage || errors.vat_on_commission_percentage) {
              toast.error("Fix the highlighted fields before saving");
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="commission-payer" className="text-sm font-medium">Who Pays Commission?</label>
              <select id="commission-payer" required value={payer} disabled={mutation.isPending}
                onChange={e => setPayer(e.target.value as CommissionPayer)}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="" disabled>Select payer</option>
                <option value="owner">Owner</option>
                <option value="resident">Resident</option>
              </select>
              {touched && !payer && <p className="text-xs text-destructive">Choose a payer</p>}
            </div>
            {(Object.keys(LABELS) as Key[]).map((k) => {
              const err = touched || form[k] !== "" ? errors[k] : null;
              return (
                <div key={k} className="space-y-1.5">
                  <label htmlFor={k} className="text-sm font-medium text-foreground">{LABELS[k]}</label>
                  <div className="relative">
                    <input
                      id={k}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      max={100}
                      value={form[k]}
                      disabled={mutation.isPending}
                      onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                      aria-invalid={Boolean(err)}
                      className={`h-11 w-full rounded-xl border bg-background px-3 pr-8 text-sm ${err ? "border-destructive" : "border-border"}`}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                  <p className={`text-xs ${err ? "text-destructive" : "text-muted-foreground"}`}>
                    {err ?? "Between 0 and 100, decimals allowed."}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {data?.updated_at ? `Last updated ${new Date(data.updated_at).toLocaleString()}${data.updated_by_name ? ` by ${data.updated_by_name}` : ""}` : ""}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={reset}
                disabled={mutation.isPending || !dirty}
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending || !dirty}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {mutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
          {!!data?.history.length && (
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Change history ({data.history.length})</summary>
              <ul className="mt-2 space-y-1">
                {data.history.map((h) => (
                  <li key={h.id} className="text-foreground">
                    {new Date(h.created_at).toLocaleString()} — {h.field === "commission_payer" ? `Who Pays Commission?: ${h.previous_payer ?? "—"} → ${h.new_payer ?? "—"}` : `${LABELS[h.field]}: ${h.previous_value?.toFixed(2) ?? "—"}% → ${h.new_value?.toFixed(2) ?? "—"}%`} by {h.changed_by_name ?? "System"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </form>
      )}
    </section>
  );
}
