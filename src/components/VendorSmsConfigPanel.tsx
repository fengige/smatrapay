import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, MessageSquare, Save } from "lucide-react";
import { toast } from "sonner";
import {
  listVendorSmsProviders,
  saveVendorSmsProvider,
  setVendorSmsProviderEnabled,
  SMS_FIELDS,
  type VendorSmsProvider,
} from "@/lib/vendor-sms.functions";

export function VendorSmsConfigPanel({
  vendorId,
  vendorName,
  vendorStatus,
}: {
  vendorId: string;
  vendorName: string;
  vendorStatus: string;
}) {
  const list = useServerFn(listVendorSmsProviders);
  const queryKey = ["vendor-sms", vendorId];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => list({ data: { vendorId } }),
  });
  const providers = data?.providers ?? [];
  const active = providers.find((p) => p.is_enabled);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <MessageSquare className="size-4 text-primary" /> SMS Configuration
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the SMS model you want to use for OTP and other SMS notifications.
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-foreground">{vendorName}</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
              {vendorStatus}
            </span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-primary bg-primary/10 px-4 py-2.5 text-sm font-medium text-foreground">
            <input type="radio" checked readOnly className="accent-primary" /> Third Party
          </label>
        </div>
        {!isLoading && !active && providers.length > 0 && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="size-4" /> No SMS provider is enabled for this vendor yet.
          </p>
        )}
        {active && (
          <p className="mt-3 text-xs text-muted-foreground">
            Active provider: <span className="font-semibold text-foreground">{active.provider_name}</span>
          </p>
        )}
      </section>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">
          Could not load SMS providers: {(error as Error).message}{" "}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No SMS providers are configured. Add providers under Configurations → SMS Configuration.
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {providers.map((p) => (
            <ProviderCard key={p.id} vendorId={vendorId} provider={p} queryKey={queryKey} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  vendorId,
  provider,
  queryKey,
}: {
  vendorId: string;
  provider: VendorSmsProvider;
  queryKey: unknown[];
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveVendorSmsProvider);
  const toggle = useServerFn(setVendorSmsProviderEnabled);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [remove, setRemove] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    setValues(provider.values as Record<string, string>);
    setRemove([]);
  }, [provider]);

  const fields = SMS_FIELDS.filter((f) => provider.fields.includes(f.key));

  const saveM = useMutation({
    mutationFn: () =>
      save({ data: { vendorId, providerId: provider.id, values, removeSecrets: remove } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      toast.success(`${provider.provider_name} configuration saved`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleM = useMutation({
    mutationFn: (enabled: boolean) =>
      toggle({ data: { vendorId, providerId: provider.id, enabled } }),
    onSuccess: async (_r, enabled) => {
      setConfirmOff(false);
      await qc.invalidateQueries({ queryKey });
      toast.success(`${provider.provider_name} ${enabled ? "enabled" : "disabled"} for this vendor`);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setOpen(true);
    },
  });

  function validate() {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.key] ?? "").trim();
      const hasStored = f.secret && provider.stored_secrets[f.key] && !remove.includes(f.key);
      if (!v && !hasStored) errs[f.key] = `${f.label} is required`;
    }
    if (values.api_url && !/^https?:\/\/.+/i.test(values.api_url)) errs.api_url = "Enter a valid http(s) URL";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground">{provider.provider_name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure {provider.provider_name} as an SMS gateway.
        {!provider.global_active && " (Inactive globally)"}
      </p>
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {open ? "Hide Configuration" : "View Configuration"}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={provider.is_enabled}
          aria-label={`${provider.is_enabled ? "Disable" : "Enable"} ${provider.provider_name}`}
          disabled={toggleM.isPending}
          onClick={() => (provider.is_enabled ? setConfirmOff(true) : toggleM.mutate(true))}
          className="flex items-center gap-2 text-sm text-muted-foreground disabled:opacity-60"
        >
          {toggleM.isPending && <Loader2 className="size-3 animate-spin" />}
          {provider.is_enabled ? "Enabled" : "Enable"}
          <span className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${provider.is_enabled ? "bg-primary" : "bg-muted"}`}>
            <span className={`absolute top-0.5 size-4 rounded-full bg-background transition-all ${provider.is_enabled ? "left-4" : "left-0.5"}`} />
          </span>
        </button>
      </div>

      {confirmOff && (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <p className="text-foreground">
            Disable {provider.provider_name} for this vendor? Credentials and SMS history are kept.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setConfirmOff(false)}>Cancel</button>
            <button
              className="rounded-lg bg-destructive px-3 py-1.5 text-sm font-semibold text-destructive-foreground"
              onClick={() => toggleM.mutate(false)}
            >
              Disable
            </button>
          </div>
        </div>
      )}

      <div hidden={!open} className="mt-4 border-t border-border pt-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (validate()) saveM.mutate();
          }}
          className="space-y-3"
        >
          {fields.map((f) => {
            const id = `vsms-${provider.id}-${f.key}`;
            const stored = f.secret && provider.stored_secrets[f.key];
            return (
              <div key={f.key} className="space-y-1">
                <label htmlFor={id} className="text-sm font-medium text-foreground">{f.label}</label>
                <div className="relative">
                  <input
                    id={id}
                    type={f.secret && !reveal[f.key] ? "password" : "text"}
                    autoComplete="new-password"
                    maxLength={500}
                    value={values[f.key] ?? ""}
                    placeholder={stored && !remove.includes(f.key) ? "•••••••• (stored — leave blank to keep)" : ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 pr-10 text-sm"
                  />
                  {f.secret && (
                    <button
                      type="button"
                      aria-label={reveal[f.key] ? "Hide value" : "Show value"}
                      onClick={() => setReveal((r) => ({ ...r, [f.key]: !r[f.key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {reveal[f.key] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  )}
                </div>
                {stored && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={remove.includes(f.key)}
                      onChange={(e) =>
                        setRemove((r) => (e.target.checked ? [...r, f.key] : r.filter((k) => k !== f.key)))
                      }
                    />
                    Remove the stored value
                  </label>
                )}
                {errors[f.key] && <p className="text-xs text-destructive">{errors[f.key]}</p>}
              </div>
            );
          })}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saveM.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saveM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saveM.isPending ? "Saving…" : "Save Configuration"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
