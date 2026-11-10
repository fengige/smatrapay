import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { commissionForOwner, ownerCommissionInput, ownerCommissionKey, type OwnerCommission } from "@/lib/owner-commission";
import { getOwnerCommissionHistory, listOwnerCommissionSettings, saveOwnerCommissionSettings } from "@/lib/owner-commission.functions";
import { commissionRefreshInterval, refreshOwnerCommission } from "@/lib/admin-pricing-refresh";

export function OwnerCommissionSettingsCard({ owners }: { owners: { id: string; name: string }[] }) {
  const [ownerId, setOwnerId] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useServerFn(listOwnerCommissionSettings);
  const query = useQuery({ queryKey: ownerCommissionKey, queryFn: () => load(), refetchInterval: commissionRefreshInterval, refetchOnWindowFocus: "always" });
  return (
    <section className="my-4 border-y border-border py-5">
      <h2 className="text-sm font-bold">Owner Commission Configuration</h2>
      <label htmlFor="commission-owner" className="mt-4 block text-sm font-medium">Owner account</label>
      <select id="commission-owner" value={ownerId} disabled={saving} onChange={event => setOwnerId(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
        <option value="">Select owner</option>
        {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
      </select>
      {query.isError && <p role="alert" className="mt-3 text-sm text-destructive">Could not refresh owner settings. Please try Refresh.</p>}
      {ownerId && (query.isPending ? <Loader2 className="mt-4 size-5 animate-spin" /> : query.data &&
        <OwnerCommissionForm key={ownerId} ownerId={ownerId} configuration={commissionForOwner(ownerId, query.data)} onSaving={setSaving} />)}
    </section>
  );
}

function OwnerCommissionForm({ ownerId, configuration, onSaving }: { ownerId: string; configuration: OwnerCommission | null; onSaving: (saving: boolean) => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveOwnerCommissionSettings);
  const loadHistory = useServerFn(getOwnerCommissionHistory);
  const [payer, setPayer] = useState(configuration?.commission_payer ?? "");
  const [commission, setCommission] = useState(configuration?.commission_percentage.toFixed(2) ?? "");
  const [vat, setVat] = useState(configuration?.vat_on_commission_percentage.toFixed(2) ?? "");
  const [editing, setEditing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const reset = () => {
    setPayer(configuration?.commission_payer ?? "");
    setCommission(configuration?.commission_percentage.toFixed(2) ?? "");
    setVat(configuration?.vat_on_commission_percentage.toFixed(2) ?? "");
    setEditing(false); setSubmitted(false);
  };
  useEffect(() => { if (!editing) reset(); }, [configuration, editing]);
  const history = useQuery({ queryKey: [...ownerCommissionKey, "history", ownerId], queryFn: () => loadHistory({ data: { owner_id: ownerId } }), refetchInterval: commissionRefreshInterval, refetchOnWindowFocus: "always" });
  const input = { owner_id: ownerId, commission_payer: payer, commission_percentage: Number(commission), vat_on_commission_percentage: Number(vat) };
  const valid = payer !== "" && commission.trim() !== "" && vat.trim() !== "" && ownerCommissionInput.safeParse(input).success;
  const dirty = !configuration || payer !== configuration.commission_payer || Number(commission) !== configuration.commission_percentage || Number(vat) !== configuration.vat_on_commission_percentage;
  const mutation = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error("Choose a payer and enter percentages between 0 and 100");
      onSaving(true);
      return save({ data: ownerCommissionInput.parse(input) });
    },
    onSuccess: async () => {
      try {
        await refreshOwnerCommission(qc);
        setEditing(false);
        toast.success("Owner commission settings saved");
      } catch {
        toast.warning("Owner settings saved, but the table could not refresh. Please try Refresh.");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Could not save owner settings"),
    onSettled: () => onSaving(false),
  });
  return (
    <form className="mt-4" noValidate onSubmit={event => { event.preventDefault(); setSubmitted(true); if (valid) mutation.mutate(); }}>
      {!configuration && <p className="mb-3 text-sm text-muted-foreground">Not configured</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="owner-commission-payer" className="text-sm font-medium">Who Pays Commission?</label>
          <select id="owner-commission-payer" required value={payer} disabled={mutation.isPending} onChange={event => { setEditing(true); setPayer(event.target.value); }} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
            <option value="" disabled>Select payer</option><option value="owner">Owner</option><option value="resident">Resident</option>
          </select>
        </div>
        {([{ label: "Commission (%)", id: "owner-commission-percentage", value: commission, set: setCommission }, { label: "VAT on Commission (%)", id: "owner-vat-percentage", value: vat, set: setVat }]).map(field => (
          <div key={field.id}>
            <label htmlFor={field.id} className="text-sm font-medium">{field.label}</label>
            <input id={field.id} required type="number" min={0} max={100} step="0.01" inputMode="decimal" value={field.value} disabled={mutation.isPending} onChange={event => { setEditing(true); field.set(event.target.value); }} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </div>
        ))}
      </div>
      {submitted && !valid && <p role="alert" className="mt-3 text-sm text-destructive">Choose a payer and enter percentages between 0 and 100.</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{configuration && `Last updated ${new Date(configuration.updated_at).toLocaleString()}`}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={mutation.isPending || !editing} onClick={reset}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending || !dirty}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{mutation.isPending ? "Saving…" : "Save"}</Button>
        </div>
      </div>
      {history.isError && <p role="alert" className="mt-3 text-sm text-destructive">Could not load change history.</p>}
      {!!history.data?.length && <details className="mt-4 text-xs"><summary className="cursor-pointer text-muted-foreground">Change history ({history.data.length})</summary><ul className="mt-2 space-y-1">{history.data.map(entry => {
        const before = entry.previous_configuration as Record<string, unknown> | null;
        const after = entry.new_configuration as Record<string, unknown>;
        const describe = (value: Record<string, unknown> | null) => value ? `${value['commission_payer'] === "owner" ? "Owner" : "Resident"} · ${Number(value['commission_percentage']).toFixed(2)}% · VAT ${Number(value['vat_on_commission_percentage']).toFixed(2)}%` : "Not configured";
        return <li key={entry.id}>{new Date(entry.created_at).toLocaleString()} — {describe(before)} → {describe(after)}</li>;
      })}</ul></details>}
    </form>
  );
}