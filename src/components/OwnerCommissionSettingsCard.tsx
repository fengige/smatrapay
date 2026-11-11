import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { changeCommissionTarget, commissionForScope, ownerCommissionInput, ownerCommissionKey, ownerCommissionTargetsKey, type CommissionOption, type CommissionOwnerType, type OwnerCommission } from "@/lib/owner-commission";
import { getOwnerCommissionHistory, listCommissionOwners, listCommissionProperties, listOwnerCommissionSettings, saveOwnerCommissionSettings } from "@/lib/owner-commission.functions";
import { commissionRefreshInterval, refreshOwnerCommission } from "@/lib/admin-pricing-refresh";

const ownerLabels = { landlord: "Landlord", vendor: "Vendor", agent: "Agent" };

export function OwnerCommissionSettingsCard() {
  const [target, setTarget] = useState<{ owner_type: CommissionOwnerType | ""; owner_id: string; property_scope: "all" | "specific" | ""; property_id: string }>({ owner_type: "", owner_id: "", property_scope: "", property_id: "" });
  const [saving, setSaving] = useState(false);
  const load = useServerFn(listOwnerCommissionSettings);
  const loadOwners = useServerFn(listCommissionOwners);
  const loadProperties = useServerFn(listCommissionProperties);
  const query = useQuery({ queryKey: ownerCommissionKey, queryFn: () => load(), refetchInterval: commissionRefreshInterval, refetchOnWindowFocus: "always" });
  const owners = useQuery({ queryKey: [...ownerCommissionTargetsKey, target.owner_type], enabled: !!target.owner_type, queryFn: () => {
    if (!target.owner_type) return Promise.resolve([]);
    return loadOwners({ data: { owner_type: target.owner_type } });
  }, refetchOnWindowFocus: "always", refetchInterval: commissionRefreshInterval });
  const properties = useQuery({ queryKey: [...ownerCommissionTargetsKey, target.owner_type, target.owner_id], enabled: !!target.owner_type && !!target.owner_id, queryFn: () => {
    if (!target.owner_type || !target.owner_id) return Promise.resolve([]);
    return loadProperties({ data: { owner_type: target.owner_type, owner_id: target.owner_id } });
  }, refetchOnWindowFocus: "always", refetchInterval: commissionRefreshInterval });
  const ownerValid = owners.data?.some(owner => owner.id === target.owner_id) ?? false;
  const propertyId = target.property_scope === "specific" ? target.property_id : null;
  const targetValid = !!target.owner_type && ownerValid && !!target.property_scope && !!properties.data?.length && !owners.isError && !properties.isError && (target.property_scope === "all" || properties.data.some(property => property.id === propertyId));
  const label = target.owner_type ? `Select ${ownerLabels[target.owner_type]}` : "Owner account";
  return (
    <section className="my-4 border-y border-border py-5">
      <h2 className="text-sm font-bold">Owner Commission Configuration</h2>
      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <label htmlFor="commission-owner-type" className="block text-sm font-medium">Select Owner</label>
          <select id="commission-owner-type" required value={target.owner_type} disabled={saving} onChange={event => setTarget(current => changeCommissionTarget(current, { owner_type: event.target.value as CommissionOwnerType | "" }))} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
            <option value="" disabled>Select Owner</option>
            <option value="landlord">Landlord</option><option value="vendor">Vendor</option><option value="agent">Agent</option>
          </select>
        </div>
        {target.owner_type && <div className="min-w-0">
          <label htmlFor="commission-owner" className="block text-sm font-medium">{label}</label>
          <TargetSelect id="commission-owner" label={label} value={target.owner_id} options={owners.data ?? []} disabled={saving || owners.isPending || owners.isError} onChange={owner_id => setTarget(current => changeCommissionTarget(current, { owner_id }))} />
        </div>}
        {target.owner_id && <div className="min-w-0">
          <label htmlFor="commission-property-scope" className="block text-sm font-medium">Select Property</label>
          <select id="commission-property-scope" required value={target.property_scope} disabled={saving || properties.isPending || properties.isError || !properties.data?.length} onChange={event => setTarget(current => changeCommissionTarget(current, { property_scope: event.target.value as "all" | "specific" | "" }))} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
            <option value="" disabled>Select Property</option><option value="all">All Properties</option><option value="specific">Specific Property</option>
          </select>
        </div>}
        {target.property_scope === "specific" && <div className="min-w-0">
          <label htmlFor="commission-property" className="block text-sm font-medium">Select Property</label>
          <TargetSelect key={`${target.owner_type}:${target.owner_id}`} id="commission-property" label="Select Property" value={target.property_id} options={properties.data ?? []} disabled={saving || properties.isPending || properties.isError} onChange={property_id => setTarget(current => ({ ...current, property_id }))} />
        </div>}
      </div>
      {(owners.isError || properties.isError) && <p role="alert" className="mt-3 text-sm text-destructive">Could not load eligible owners or properties. Please try Refresh.</p>}
      {target.owner_id && properties.isPending && <Loader2 aria-label="Loading properties" className="mt-3 size-5 animate-spin" />}
      {target.owner_id && properties.isSuccess && !properties.data.length && <p role="alert" className="mt-3 text-sm text-destructive">This owner has no linked properties. Commission configuration cannot be saved.</p>}
      {query.isError && <p role="alert" className="mt-3 text-sm text-destructive">Could not refresh owner settings. Please try Refresh.</p>}
      {targetValid && target.owner_type && target.property_scope && (query.isPending ? <Loader2 className="mt-4 size-5 animate-spin" /> : query.data &&
        <OwnerCommissionForm key={`${target.owner_type}:${target.owner_id}:${target.property_scope}:${target.property_id}`} ownerType={target.owner_type} ownerId={target.owner_id} propertyScope={target.property_scope} propertyId={propertyId} configuration={commissionForScope(target.owner_id, propertyId, query.data)} onSaving={setSaving} unavailable={query.isError} />)}
    </section>
  );
}

function TargetSelect({ id, label, value, options, disabled, onChange }: { id: string; label: string; value: string; options: CommissionOption[]; disabled: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button id={id} type="button" role="combobox" aria-label={label} aria-required="true" aria-expanded={open} variant="outline" disabled={disabled} className="mt-1.5 h-11 w-full min-w-0 justify-between font-normal">
      <span className="truncate">{options.find(option => option.id === value)?.name ?? label}</span><ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
      <Command><CommandInput placeholder={`Search ${label.replace("Select ", "").toLowerCase()}…`} /><CommandList><CommandEmpty>No matching options.</CommandEmpty><CommandGroup>
        {options.map(option => <CommandItem key={option.id} value={option.id} keywords={[option.name]} onSelect={() => { onChange(option.id); setOpen(false); }}><span className="min-w-0 flex-1 break-words">{option.name}</span>{value === option.id && <Check className="size-4" />}</CommandItem>)}
      </CommandGroup></CommandList></Command>
    </PopoverContent>
  </Popover>;
}

function OwnerCommissionForm({ ownerType, ownerId, propertyScope, propertyId, configuration, onSaving, unavailable }: { ownerType: CommissionOwnerType; ownerId: string; propertyScope: "all" | "specific"; propertyId: string | null; configuration: OwnerCommission | null; onSaving: (saving: boolean) => void; unavailable: boolean }) {
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
  const history = useQuery({ queryKey: [...ownerCommissionKey, "history", ownerId, propertyId], queryFn: () => loadHistory({ data: { owner_id: ownerId, property_id: propertyId } }), refetchInterval: commissionRefreshInterval, refetchOnWindowFocus: "always" });
  const input = { owner_type: ownerType, property_scope: propertyScope, owner_id: ownerId, property_id: propertyId, commission_payer: payer, commission_percentage: Number(commission), vat_on_commission_percentage: Number(vat) };
  const valid = !unavailable && payer !== "" && commission.trim() !== "" && vat.trim() !== "" && ownerCommissionInput.safeParse(input).success;
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
          <Button type="submit" disabled={mutation.isPending || !dirty || unavailable}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{mutation.isPending ? "Saving…" : "Save"}</Button>
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