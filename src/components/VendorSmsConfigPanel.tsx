import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Eye, EyeOff, Loader2, MessageSquare, PlugZap, Save, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getVendorTiaraConfig,
  saveVendorTiaraConfig,
  sendVendorTiaraTestSms,
  setVendorTiaraEnabled,
  testVendorTiaraConnection,
  TIARA_DEFAULT_ENDPOINT,
  type ConnectionResult,
  type TestSmsResult,
  type TiaraConfig,
} from "@/lib/vendor-tiara.functions";

type Form = {
  api_url: string;
  api_key: string;
  remove_api_key: boolean;
  sender_id: string;
  message_type: 1 | 2;
  default_country_code: string;
  delivery_receipt_callback_url: string;
};

const fromConfig = (c: TiaraConfig): Form => ({
  api_url: c.api_url || TIARA_DEFAULT_ENDPOINT,
  api_key: "",
  remove_api_key: false,
  sender_id: c.sender_id,
  message_type: c.message_type,
  default_country_code: c.default_country_code,
  delivery_receipt_callback_url: c.delivery_receipt_callback_url,
});

const inputCls = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60";

export function VendorSmsConfigPanel({
  vendorId,
  vendorName,
  vendorStatus,
}: {
  vendorId: string;
  vendorName: string;
  vendorStatus: string;
}) {
  const qc = useQueryClient();
  const queryKey = ["vendor-tiara", vendorId];
  const get = useServerFn(getVendorTiaraConfig);
  const save = useServerFn(saveVendorTiaraConfig);
  const toggle = useServerFn(setVendorTiaraEnabled);
  const test = useServerFn(testVendorTiaraConnection);
  const { data: cfg, isLoading, error, refetch } = useQuery({ queryKey, queryFn: () => get({ data: { vendorId } }) });

  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [revealKey, setRevealKey] = useState(false);
  const [replacingKey, setReplacingKey] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [conn, setConn] = useState<ConnectionResult | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    if (cfg) {
      setForm(fromConfig(cfg));
      setReplacingKey(false);
      setErrors({});
    }
  }, [cfg]);

  const saveM = useMutation({
    mutationFn: (f: Form) => save({ data: { vendorId, ...f } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      toast.success("SMS configuration saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleM = useMutation({
    mutationFn: (enabled: boolean) => toggle({ data: { vendorId, enabled } }),
    onSuccess: async (_r, enabled) => {
      setConfirmOff(false);
      await qc.invalidateQueries({ queryKey });
      toast.success(`SMS service ${enabled ? "enabled" : "disabled"} for this vendor`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const testM = useMutation({
    mutationFn: () => test({ data: { vendorId } }),
    onSuccess: (r) => {
      setConn(r);
      (r.ok ? toast.success : toast.error)(r.ok ? "Connection check passed" : "Connection failed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !form)
    return error ? (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">
        Could not load SMS configuration: {(error as Error).message}{" "}
        <button className="underline" onClick={() => refetch()}>Retry</button>
      </div>
    ) : (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading SMS configuration…
      </div>
    );
  const c = cfg!;
  const dirty = JSON.stringify(form) !== JSON.stringify(fromConfig(c));
  const busy = saveM.isPending || testM.isPending || toggleM.isPending;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  function validate(f: Form) {
    const e: Record<string, string> = {};
    try {
      const u = new URL(f.api_url);
      if (!/^https?:$/.test(u.protocol)) throw 0;
    } catch {
      e["api_url"] = "Enter a valid http(s) URL";
    }
    if (!c.has_api_key && !f.api_key) e["api_key"] = "API Key is required";
    if (f.remove_api_key && !f.api_key && c.enabled) e["api_key"] = "Disable the service before removing the API key";
    if (!f.sender_id.trim()) e["sender_id"] = "Sender ID is required";
    else if (f.sender_id.trim().length > 11) e["sender_id"] = "Sender ID must be 11 characters or fewer";
    if (!/^\d{1,4}$/.test(f.default_country_code)) e["default_country_code"] = "Use 1–4 digits, e.g. 254";
    if (f.delivery_receipt_callback_url && !/^https:\/\/.+/i.test(f.delivery_receipt_callback_url))
      e["delivery_receipt_callback_url"] = "Must be a public https:// URL";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <MessageSquare className="size-4 text-primary" /> SMS Provider Configuration
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Configure SMS messaging services for this vendor.</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-foreground">{vendorName}</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">{vendorStatus}</span>
          </div>
        </div>
        {!c.configured && (
          <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            No SMS configuration saved for this vendor yet.
          </p>
        )}
        {!c.providerActive && (
          <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            TIARA CONNECT is inactive under Configurations → SMS Configuration. It can't be enabled until it's activated there.
          </p>
        )}
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (validate(form)) saveM.mutate(form);
        }}
        className="space-y-4"
      >
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Provider</h3>
            <Field label="SMS Provider" id="sms-provider">
              <select id="sms-provider" className={inputCls} value={c.providerId} disabled>
                <option value={c.providerId}>TIARA CONNECT</option>
              </select>
            </Field>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">SMS Service Status</p>
                <p className="text-xs text-muted-foreground">
                  {c.enabled ? "Enabled — this vendor can send SMS." : "Disabled — no SMS will be sent with this configuration."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={c.enabled}
                aria-label="SMS Service Status"
                disabled={busy || (!c.enabled && dirty)}
                title={!c.enabled && dirty ? "Save your changes first" : undefined}
                onClick={() => (c.enabled ? setConfirmOff(true) : toggleM.mutate(true))}
                className="flex items-center gap-2 text-sm text-muted-foreground disabled:opacity-60"
              >
                {toggleM.isPending && <Loader2 className="size-3 animate-spin" />}
                <span className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${c.enabled ? "bg-primary" : "bg-muted"}`}>
                  <span className={`absolute top-0.5 size-4 rounded-full bg-background transition-all ${c.enabled ? "left-4" : "left-0.5"}`} />
                </span>
              </button>
            </div>
            {confirmOff && (
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <p className="text-foreground">Disable SMS for this vendor? Saved settings and SMS history are kept.</p>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setConfirmOff(false)}>Cancel</button>
                  <button
                    type="button"
                    className="rounded-lg bg-destructive px-3 py-1.5 text-sm font-semibold text-destructive-foreground"
                    onClick={() => toggleM.mutate(false)}
                  >
                    Disable
                  </button>
                </div>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-foreground">Provider Website</p>
              <a href="https://tiaraconnect.io/" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-primary underline">
                https://tiaraconnect.io/ <ExternalLink className="size-3" />
              </a>
            </div>
            <Field label="SMS API Endpoint" id="sms-endpoint" error={errors["api_url"]} help="TIARA CONNECT endpoint used to submit SMS messages.">
              <input id="sms-endpoint" className={inputCls} value={form.api_url} maxLength={500} onChange={(e) => set("api_url", e.target.value)} />
            </Field>
            <Field label="Message Type" id="sms-type">
              <select id="sms-type" className={inputCls} value={form.message_type} onChange={(e) => set("message_type", Number(e.target.value) as 1 | 2)}>
                <option value={1}>Standard SMS (1)</option>
                <option value={2}>Flash SMS (2) — subject to provider/network support</option>
              </select>
            </Field>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Credentials & sending</h3>
            <Field label="API Key" id="sms-key" error={errors["api_key"]} help="Enter the Bearer API key provided by TIARA CONNECT.">
              {c.has_api_key && !replacingKey && !form.remove_api_key ? (
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> •••••••• stored securely</span>
                  <button type="button" className="text-sm font-medium text-primary" onClick={() => setReplacingKey(true)}>Replace API Key</button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    id="sms-key"
                    type={revealKey ? "text" : "password"}
                    autoComplete="new-password"
                    className={`${inputCls} pr-10`}
                    value={form.api_key}
                    maxLength={1000}
                    placeholder={c.has_api_key ? "Leave blank to keep the stored key" : ""}
                    onChange={(e) => set("api_key", e.target.value)}
                  />
                  <button type="button" aria-label={revealKey ? "Hide key" : "Show key"} onClick={() => setRevealKey((r) => !r)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {revealKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              )}
              {c.has_api_key && (
                <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={form.remove_api_key} onChange={(e) => set("remove_api_key", e.target.checked)} />
                  Remove Stored API Key
                </label>
              )}
            </Field>
            <Field
              label="Sender ID"
              id="sms-sender"
              error={errors["sender_id"]}
              help="Registered sender name or short code used to send SMS messages. The sender ID must be authorized by the SMS provider."
            >
              <input id="sms-sender" className={inputCls} value={form.sender_id} maxLength={11} placeholder="TIARA" onChange={(e) => set("sender_id", e.target.value)} />
            </Field>
            <Field label="Default Country Code" id="sms-cc" error={errors["default_country_code"]} help="Used to format numbers like 07XX… into 2547XX…">
              <input id="sms-cc" className={inputCls} inputMode="numeric" value={form.default_country_code} maxLength={4} onChange={(e) => set("default_country_code", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field
              label="Delivery Receipt Callback URL (optional)"
              id="sms-dlr"
              error={errors["delivery_receipt_callback_url"]}
              help="A public https endpoint able to process TIARA CONNECT delivery receipts. SmatraPay doesn't have one yet, so receipts aren't processed and messages show as submitted, not delivered."
            >
              <input id="sms-dlr" className={inputCls} value={form.delivery_receipt_callback_url} maxLength={500} placeholder="https://…" onChange={(e) => set("delivery_receipt_callback_url", e.target.value)} />
            </Field>
          </section>
        </div>

        {conn && (
          <div className={`rounded-2xl border p-4 text-sm ${conn.ok ? "border-primary/40 bg-primary/5 text-foreground" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>
            <p className="font-semibold">
              {conn.ok ? "Connection successful" : { auth: "Authentication failure", endpoint: "Invalid endpoint", network: "Network / timeout error", provider: "Provider error", verified: "" }[conn.kind]}
            </p>
            <p className="mt-1">{conn.message}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || dirty || !c.configured}
              title={dirty ? "Save your changes first" : undefined}
              onClick={() => testM.mutate()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60"
            >
              {testM.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
              {testM.isPending ? "Testing…" : "Test API Connection"}
            </button>
            <button
              type="button"
              disabled={busy || dirty || !c.enabled}
              title={!c.enabled ? "Enable the SMS service first" : dirty ? "Save your changes first" : undefined}
              onClick={() => setTestOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60"
            >
              <Send className="size-4" /> Send Test SMS
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!dirty || saveM.isPending}
              onClick={() => {
                setForm(fromConfig(c));
                setErrors({});
                setReplacingKey(false);
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveM.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saveM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saveM.isPending ? "Saving…" : "Save SMS Configuration"}
            </button>
          </div>
        </div>
      </form>

      {testOpen && <TestSmsDialog vendorId={vendorId} senderId={c.sender_id} countryCode={c.default_country_code} onClose={() => setTestOpen(false)} />}
    </div>
  );
}

function Field({ label, id, error, help, children }: { label: string; id: string; error?: string | undefined; help?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TestSmsDialog({ vendorId, senderId, countryCode, onClose }: { vendorId: string; senderId: string; countryCode: string; onClose: () => void }) {
  const send = useServerFn(sendVendorTiaraTestSms);
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("This is a test SMS from SmatraPay.");
  const [confirming, setConfirming] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<TestSmsResult | null>(null);
  const m = useMutation({
    mutationFn: () => send({ data: { vendorId, recipient, message, idempotencyKey: key } }),
    onSuccess: (r) => {
      setResult(r);
      (r.submitted ? toast.success : toast.error)(r.submitted ? "Test SMS submitted" : "Test SMS failed");
    },
    onError: (e: Error) => {
      setConfirming(false);
      toast.error(e.message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label="Send Test SMS">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-lg">
        <h3 className="text-base font-semibold text-foreground">Send Test SMS</h3>
        {result ? (
          <div className="space-y-2 text-sm">
            <p className={result.submitted ? "font-semibold text-foreground" : "font-semibold text-destructive"}>
              {result.submitted ? "Submitted to TIARA CONNECT (not yet confirmed delivered)" : "Not accepted by the provider"}
            </p>
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Recipient</dt><dd>{result.recipient}</dd>
              <dt className="text-muted-foreground">Status</dt><dd>{result.status ?? "—"} {result.statusCode != null && `(${result.statusCode})`}</dd>
              <dt className="text-muted-foreground">Description</dt><dd>{result.desc ?? "—"}</dd>
              <dt className="text-muted-foreground">Message ID</dt><dd className="break-all">{result.msgId ?? "—"}</dd>
              <dt className="text-muted-foreground">Cost</dt><dd>{result.cost ?? "—"}</dd>
              <dt className="text-muted-foreground">Balance</dt><dd>{result.balance ?? "—"}</dd>
            </dl>
            <div className="flex justify-end"><button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={onClose}>Close</button></div>
          </div>
        ) : (
          <>
            <Field label="Recipient Mobile Number" id="t-to" help={`Numbers starting with 0 use country code ${countryCode}.`}>
              <input id="t-to" className={inputCls} value={recipient} disabled={confirming} onChange={(e) => setRecipient(e.target.value)} placeholder="07XXXXXXXX" />
            </Field>
            <Field label="Test Message" id="t-msg">
              <textarea id="t-msg" className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" maxLength={480} value={message} disabled={confirming} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <Field label="Sender ID" id="t-sender">
              <input id="t-sender" className={inputCls} value={senderId} disabled />
            </Field>
            {confirming && <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-foreground">This sends a real, billable SMS to {recipient}. Confirm to continue.</p>}
            <div className="flex justify-end gap-2">
              <button className="rounded-lg px-4 py-2 text-sm" onClick={onClose} disabled={m.isPending}>Cancel</button>
              {confirming ? (
                <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={m.isPending} onClick={() => m.mutate()}>
                  {m.isPending && <Loader2 className="size-4 animate-spin" />} {m.isPending ? "Sending…" : "Confirm Send"}
                </button>
              ) : (
                <button
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  disabled={recipient.trim().length < 6 || !message.trim()}
                  onClick={() => setConfirming(true)}
                >
                  Send
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
