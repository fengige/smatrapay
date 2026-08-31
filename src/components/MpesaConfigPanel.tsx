import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Eye, EyeOff, Loader2, PlugZap, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import {
  getMpesaConfig,
  initiateStkPush,
  listMpesaTransactions,
  registerC2BUrls,
  saveMpesaConfig,
  testMpesaConnection,
  type MpesaConfigView,
} from "@/lib/mpesa.functions";

type Env = "sandbox" | "production";

type FormState = {
  enabled: boolean;
  country: string;
  currency: string;
  consumer_key: string;
  consumer_secret: string;
  business_short_code: string;
  passkey: string;
  transaction_type: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  account_reference: string;
  transaction_desc: string;
  stk_enabled: boolean;
  c2b_enabled: boolean;
  c2b_short_code: string;
  c2b_response_type: "Completed" | "Cancelled";
  b2c_enabled: boolean;
  b2c_initiator_name: string;
  b2c_security_credential: string;
  b2c_short_code: string;
  b2c_occasion: string;
  b2c_remarks: string;
};

function fromView(v: MpesaConfigView): FormState {
  return {
    enabled: v.enabled,
    country: v.country,
    currency: v.currency,
    consumer_key: v.consumer_key,
    consumer_secret: "",
    business_short_code: v.business_short_code,
    passkey: "",
    transaction_type: (v.transaction_type as FormState["transaction_type"]) ?? "CustomerPayBillOnline",
    account_reference: v.account_reference,
    transaction_desc: v.transaction_desc,
    stk_enabled: v.stk_enabled,
    c2b_enabled: v.c2b_enabled,
    c2b_short_code: v.c2b_short_code,
    c2b_response_type: (v.c2b_response_type as FormState["c2b_response_type"]) ?? "Completed",
    b2c_enabled: v.b2c_enabled,
    b2c_initiator_name: v.b2c_initiator_name,
    b2c_security_credential: "",
    b2c_short_code: v.b2c_short_code,
    b2c_occasion: v.b2c_occasion,
    b2c_remarks: v.b2c_remarks,
  };
}

export function MpesaConfigPanel({
  paymentMethodId,
  ownerId = null,
}: {
  paymentMethodId: string;
  /** When set, reads/writes this user's own M-Pesa credentials instead of the shared ones. */
  ownerId?: string | null;
}) {
  const queryClient = useQueryClient();
  const fetchConfig = useServerFn(getMpesaConfig);
  const saveFn = useServerFn(saveMpesaConfig);
  const testFn = useServerFn(testMpesaConnection);
  const registerFn = useServerFn(registerC2BUrls);
  const stkFn = useServerFn(initiateStkPush);
  const txFn = useServerFn(listMpesaTransactions);

  const [environment, setEnvironment] = useState<Env>("sandbox");
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registerResult, setRegisterResult] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [stkPhone, setStkPhone] = useState("");
  const [stkAmount, setStkAmount] = useState("1");

  const { data: config, isLoading } = useQuery({
    queryKey: ["mpesa-config", paymentMethodId, environment, ownerId],
    queryFn: () =>
      fetchConfig({
        data: { payment_method_id: paymentMethodId, environment, owner_id: ownerId },
      } as never),
  });

  const { data: txData } = useQuery({
    queryKey: ["mpesa-transactions", paymentMethodId, ownerId],
    queryFn: () =>
      txFn({ data: { payment_method_id: paymentMethodId, owner_id: ownerId, limit: 10 } } as never),
  });

  useEffect(() => {
    if (config) setForm(fromView(config as MpesaConfigView));
    setTestResult(null);
    setRegisterResult(null);
  }, [config]);

  const urls = (config as MpesaConfigView | undefined)?.urls;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const validate = (f: FormState) => {
    const next: Record<string, string> = {};
    if (f.enabled) {
      if (!f.consumer_key.trim()) next["consumer_key"] = "Consumer Key is required";
      if (!f.consumer_secret && !(config as MpesaConfigView | undefined)?.has_consumer_secret)
        next["consumer_secret"] = "Consumer Secret is required";
      if (!f.business_short_code.trim())
        next["business_short_code"] = "Business Short Code is required";
      if (f.stk_enabled && !f.passkey && !(config as MpesaConfigView | undefined)?.has_passkey)
        next["passkey"] = "Passkey is required for STK Push";
      if (f.b2c_enabled && !f.b2c_initiator_name.trim())
        next["b2c_initiator_name"] = "Initiator Name is required for B2C";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (!validate(form)) throw new Error("Please fix the highlighted fields");
      return saveFn({
        data: { payment_method_id: paymentMethodId, environment, owner_id: ownerId, ...form },
      } as never);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["mpesa-config", paymentMethodId, environment, ownerId],
      });
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      toast.success("M-Pesa configuration saved");
    },
    onError: (e: Error) => toast.error(e.message || "Could not save the configuration"),
  });

  const test = useMutation({
    mutationFn: () =>
      testFn({
        data: { payment_method_id: paymentMethodId, environment, owner_id: ownerId },
      } as never) as Promise<{
        ok: boolean;
        message: string;
      }>,
    onSuccess: (r) => {
      setTestResult(r);
      r.ok ? toast.success(r.message) : toast.error(r.message);
    },
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  });

  const register = useMutation({
    mutationFn: () =>
      registerFn({
        data: { payment_method_id: paymentMethodId, environment, owner_id: ownerId },
      } as never) as Promise<{
        ok: boolean;
        message: string;
        response: unknown;
      }>,
    onSuccess: (r) => {
      setRegisterResult(
        `${r.message}\n${r.response ? JSON.stringify(r.response, null, 2) : ""}`.trim(),
      );
      r.ok ? toast.success(r.message) : toast.error(r.message);
    },
    onError: (e: Error) => setRegisterResult(e.message),
  });

  const stk = useMutation({
    mutationFn: () =>
      stkFn({
        data: {
          payment_method_id: paymentMethodId,
          environment,
          owner_id: ownerId,
          phone: stkPhone,
          amount: Number(stkAmount),
        },
      } as never) as Promise<{ ok: boolean; message: string }>,
    onSuccess: async (r) => {
      r.ok ? toast.success(r.message) : toast.error(r.message);
      await queryClient.invalidateQueries({
        queryKey: ["mpesa-transactions", paymentMethodId, ownerId],
      });
    },
    onError: (e: Error) => toast.error(e.message || "STK Push failed"),
  });

  const transactions = useMemo(() => (txData as any)?.transactions ?? [], [txData]);

  if (isLoading || !form) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <Loader2 className="mx-auto size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Section title="M-Pesa Integration" subtitle="Enable the Daraja integration and pick the environment">
        <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Enable M-Pesa Integration</p>
            <p className="text-xs text-muted-foreground">
              Currently running in{" "}
              <span className="font-semibold uppercase text-foreground">{environment}</span>
            </p>
          </div>
          <Switch
            checked={form.enabled}
            onChange={(v) => set("enabled", v)}
            label="Enable M-Pesa integration"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Environment">
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as Env)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </Field>
          <Field label="Country">
            <input
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </Field>
          <Field label="Currency">
            <input
              value={form.currency}
              onChange={(e) => set("currency", e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Sandbox and Production credentials are stored separately — switching the environment loads
          its own set of credentials.
        </p>
      </Section>

      <Section title="Daraja API Credentials" subtitle="Stored server-side and never returned to the browser">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Consumer Key" error={errors["consumer_key"]}>
            <input
              value={form.consumer_key}
              onChange={(e) => set("consumer_key", e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </Field>
          <SecretField
            label="Consumer Secret"
            value={form.consumer_secret}
            stored={(config as MpesaConfigView).has_consumer_secret}
            onChange={(v) => set("consumer_secret", v)}
            error={errors["consumer_secret"]}
          />
          <Field label="Business Short Code" error={errors["business_short_code"]}>
            <input
              value={form.business_short_code}
              onChange={(e) => set("business_short_code", e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </Field>
          <SecretField
            label="Passkey"
            value={form.passkey}
            stored={(config as MpesaConfigView).has_passkey}
            onChange={(v) => set("passkey", v)}
            error={errors["passkey"]}
          />
        </div>
      </Section>

      <Section title="STK Push (Lipa na M-Pesa Online)">
        <ToggleRow
          label="Enable STK Push"
          checked={form.stk_enabled}
          onChange={(v) => set("stk_enabled", v)}
        />
        {form.stk_enabled && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Transaction Type">
                <select
                  value={form.transaction_type}
                  onChange={(e) =>
                    set("transaction_type", e.target.value as FormState["transaction_type"])
                  }
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="CustomerPayBillOnline">CustomerPayBillOnline</option>
                  <option value="CustomerBuyGoodsOnline">CustomerBuyGoodsOnline</option>
                </select>
              </Field>
              <Field label="Account Reference">
                <input
                  value={form.account_reference}
                  onChange={(e) => set("account_reference", e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </Field>
              <Field label="Transaction Description">
                <input
                  value={form.transaction_desc}
                  onChange={(e) => set("transaction_desc", e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </Field>
            </div>
            <CopyUrl label="Callback URL" url={urls?.stk_callback_url ?? ""} />
          </>
        )}
      </Section>

      <Section title="C2B">
        <ToggleRow label="Enable C2B" checked={form.c2b_enabled} onChange={(v) => set("c2b_enabled", v)} />
        {form.c2b_enabled && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Short Code">
                <input
                  value={form.c2b_short_code}
                  onChange={(e) => set("c2b_short_code", e.target.value)}
                  placeholder="Defaults to the business short code"
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </Field>
              <Field label="Response Type">
                <select
                  value={form.c2b_response_type}
                  onChange={(e) =>
                    set("c2b_response_type", e.target.value as FormState["c2b_response_type"])
                  }
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </Field>
            </div>
            <CopyUrl label="Validation URL" url={urls?.c2b_validation_url ?? ""} />
            <CopyUrl label="Confirmation URL" url={urls?.c2b_confirmation_url ?? ""} />
            <button
              type="button"
              onClick={() => register.mutate()}
              disabled={register.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-accent/10"
            >
              {register.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
              Register C2B URLs
            </button>
            {registerResult && (
              <pre className="max-h-48 overflow-auto rounded-xl bg-muted/40 p-3 text-xs text-foreground">
                {registerResult}
              </pre>
            )}
          </>
        )}
      </Section>

      <Section title="B2C">
        <ToggleRow label="Enable B2C" checked={form.b2c_enabled} onChange={(v) => set("b2c_enabled", v)} />
        {form.b2c_enabled && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Initiator Name" error={errors["b2c_initiator_name"]}>
                <input
                  value={form.b2c_initiator_name}
                  onChange={(e) => set("b2c_initiator_name", e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </Field>
              <SecretField
                label="Security Credential"
                value={form.b2c_security_credential}
                stored={(config as MpesaConfigView).has_b2c_security_credential}
                onChange={(v) => set("b2c_security_credential", v)}
              />
              <Field label="Short Code">
                <input
                  value={form.b2c_short_code}
                  onChange={(e) => set("b2c_short_code", e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </Field>
              <Field label="Occasion">
                <input
                  value={form.b2c_occasion}
                  onChange={(e) => set("b2c_occasion", e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </Field>
              <Field label="Remarks">
                <input
                  value={form.b2c_remarks}
                  onChange={(e) => set("b2c_remarks", e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </Field>
            </div>
            <CopyUrl label="Result URL" url={urls?.b2c_result_url ?? ""} />
            <CopyUrl label="Queue Timeout URL" url={urls?.b2c_queue_timeout_url ?? ""} />
          </>
        )}
      </Section>

      <Section title="Connection">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => test.mutate()}
            disabled={test.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-accent/10"
          >
            {test.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Test M-Pesa Connection
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save M-Pesa Configuration
          </button>
        </div>
        {testResult && (
          <p
            role="status"
            className={`rounded-xl px-4 py-3 text-sm ${
              testResult.ok
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {testResult.message}
          </p>
        )}
      </Section>

      <Section title="Sandbox STK Push Test" subtitle="Send a live STK Push using the saved credentials">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Phone number">
            <input
              value={stkPhone}
              onChange={(e) => setStkPhone(e.target.value)}
              placeholder="2547XXXXXXXX"
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </Field>
          <Field label="Amount">
            <input
              value={stkAmount}
              onChange={(e) => setStkAmount(e.target.value)}
              inputMode="numeric"
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => stk.mutate()}
              disabled={stk.isPending || !stkPhone.trim()}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-semibold hover:bg-accent/10 disabled:opacity-50"
            >
              {stk.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send STK Push
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A payment is only marked completed once Safaricom posts a successful callback result.
        </p>
      </Section>

      <Section title="Recent M-Pesa Transactions">
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No M-Pesa transactions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Receipt</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t: any) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2 pr-3">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">{t.phone_number ?? "—"}</td>
                    <td className="py-2 pr-3">{t.amount ?? "—"}</td>
                    <td className="py-2 pr-3">{t.mpesa_receipt_number ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : t.status === "failed"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-amber-500/10 text-amber-600"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-foreground">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

function SecretField({
  label,
  value,
  stored,
  onChange,
  error,
}: {
  label: string;
  value: string;
  stored: boolean;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} error={error}>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          autoComplete="new-password"
          placeholder={stored ? "•••••••• (stored — leave blank to keep)" : ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 pr-11 text-sm"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
}

function CopyUrl({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="text-sm">
      <span className="mb-1 block font-medium text-foreground">{label}</span>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          aria-label={label}
          className="h-11 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm text-muted-foreground"
        />
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            toast.success(`${label} copied`);
            setTimeout(() => setCopied(false), 1500);
          }}
          aria-label={`Copy ${label}`}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-accent/10"
        >
          {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${checked ? "left-[1.375rem]" : "left-0.5"}`}
      />
    </button>
  );
}
