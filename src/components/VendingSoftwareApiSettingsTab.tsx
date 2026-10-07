import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Loader2, PlugZap, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getVendingSoftwareApiSettings,
  saveVendingSoftwareApiSettings,
  testVendingSoftwareApiConnection,
  type VendingSoftwareApiSettings,
} from "@/lib/vending-software-api.functions";

type FormState = Omit<VendingSoftwareApiSettings, "has_password" | "has_vend_password" | "has_company_name" | "has_user_name" | "updated_at" | "is_icon" | "has_taas_id" | "has_taas_password">;
type FormKey = keyof FormState;

const EMPTY: FormState = {
  API_POS_PURCHASE: "",
  API_LOGIN: "",
  API_MAINTENANCE_CLEAR_TAMPER: "",
  API_MAINTENANCE_CLEAR_CREDIT: "",
  API_MAINTENANCE_SET_OVERDRAFT_LIMIT: "",
  API_COMPANY_NAME: "",
  API_USER_NAME: "",
};

const URL_KEYS: FormKey[] = [
  "API_POS_PURCHASE",
  "API_LOGIN",
  "API_MAINTENANCE_CLEAR_TAMPER",
  "API_MAINTENANCE_CLEAR_CREDIT",
  "API_MAINTENANCE_SET_OVERDRAFT_LIMIT",
];

const SECTIONS: {
  title: string;
  description: string;
  fields: { key: FormKey; label: string; helper: string; required?: boolean }[];
}[] = [
  {
    title: "Purchase & Authentication APIs",
    description: "Endpoints used when sending purchase requests and authenticating with the vending software.",
    fields: [
      {
        key: "API_POS_PURCHASE",
        label: "API POS Purchase",
        helper: "Endpoint called to purchase a token at the point of sale.",
        required: true,
      },
      {
        key: "API_LOGIN",
        label: "API Login",
        helper: "Endpoint used to authenticate with the vending software before other API calls.",
      },
    ],
  },
  {
    title: "Maintenance APIs",
    description: "Endpoints used for vending software maintenance operations.",
    fields: [
      {
        key: "API_MAINTENANCE_CLEAR_TAMPER",
        label: "API Maintenance Clear Tamper",
        helper: "Endpoint used to clear a meter tamper condition.",
      },
      {
        key: "API_MAINTENANCE_CLEAR_CREDIT",
        label: "API Maintenance Clear Credit",
        helper: "Endpoint used to clear meter credit.",
      },
      {
        key: "API_MAINTENANCE_SET_OVERDRAFT_LIMIT",
        label: "API Maintenance Set Overdraft Limit",
        helper: "Endpoint that sets the meter's maximum overdraft limit.",
      },
    ],
  },
  {
    title: "API Account Credentials",
    description: "The account this system uses when calling the vending software.",
    fields: [],
  },
];

const isUrl = (value: string) => /^https?:\/\/[^\s]+$/i.test(value);

export function VendingSoftwareApiSettingsTab({ softwareId }: { softwareId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getVendingSoftwareApiSettings);
  const save = useServerFn(saveVendingSoftwareApiSettings);
  const testConnection = useServerFn(testVendingSoftwareApiConnection);
  const queryKey = ["vending-software-api-settings", softwareId];

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => load({ data: { id: softwareId } } as never),
  });

  const settings = data?.settings;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showCompanyName, setShowCompanyName] = useState(false);
  const [showUserName, setShowUserName] = useState(false);
  const [vendPassword, setVendPassword] = useState("");
  const [clearVend, setClearVend] = useState(false);
  const [taasId, setTaasId] = useState("");
  const [showTaasId, setShowTaasId] = useState(false);
  const [taasPassword, setTaasPassword] = useState("");
  const [showTaasPassword, setShowTaasPassword] = useState(false);
  const [clearTaas, setClearTaas] = useState(false);
  const isIcon = Boolean(settings?.is_icon);
  const [errors, setErrors] = useState<Partial<Record<FormKey | "API_PASSWORD" | "API_TAAS_ID" | "API_TAAS_PASSWORD", string>>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const reset = useMemo(
    () => () => {
      if (!settings) return;
      setForm({
        API_POS_PURCHASE: settings.API_POS_PURCHASE,
        API_LOGIN: settings.API_LOGIN,
        API_MAINTENANCE_CLEAR_TAMPER: settings.API_MAINTENANCE_CLEAR_TAMPER,
        API_MAINTENANCE_CLEAR_CREDIT: settings.API_MAINTENANCE_CLEAR_CREDIT,
        API_MAINTENANCE_SET_OVERDRAFT_LIMIT: settings.API_MAINTENANCE_SET_OVERDRAFT_LIMIT,
        API_COMPANY_NAME: settings.API_COMPANY_NAME,
        API_USER_NAME: settings.API_USER_NAME,
      });
      setPassword("");
      setClearPassword(false);
      setShowPassword(false);
      setShowCompanyName(false);
      setShowUserName(false);
      setVendPassword("");
      setClearVend(false);
      setTaasId("");
      setShowTaasId(false);
      setTaasPassword("");
      setShowTaasPassword(false);
      setClearTaas(false);
      setErrors({});
      setTestResult(null);
    },
    [settings],
  );

  useEffect(() => reset(), [reset]);

  const set = (key: FormKey, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  function validate() {
    const next: Partial<Record<FormKey | "API_PASSWORD" | "API_TAAS_ID" | "API_TAAS_PASSWORD", string>> = {};
    if (!form.API_POS_PURCHASE.trim()) next.API_POS_PURCHASE = "API POS Purchase is required";
    if (isIcon) {
      if (!settings?.has_taas_id && !taasId.trim()) next.API_TAAS_ID = "API TaaS ID is required";
      if ((clearTaas || !settings?.has_taas_password) && !taasPassword) next.API_TAAS_PASSWORD = "API TaaS Password is required";
    } else {
      if (!settings?.has_company_name && !form.API_COMPANY_NAME.trim())
        next.API_COMPANY_NAME = "API Company Name is required";
      if (!settings?.has_user_name && !form.API_USER_NAME.trim()) next.API_USER_NAME = "API User Name is required";
      if (!settings?.has_password && !password) next.API_PASSWORD = "API Password is required";
    }
    for (const key of URL_KEYS) {
      const value = form[key].trim();
      if (value && !isUrl(value)) next[key] = "Enter a valid URL starting with http:// or https://";
    }
    const urls = URL_KEYS.map((key) => form[key].trim()).filter(Boolean);
    if (new Set(urls).size !== urls.length) {
      for (const key of URL_KEYS) {
        const value = form[key].trim();
        if (value && urls.filter((url) => url === value).length > 1) next[key] = "This URL is used by another endpoint";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          vending_software_id: softwareId,
          ...Object.fromEntries((Object.keys(form) as FormKey[]).map((key) => [key, form[key].trim()])),
          API_COMPANY_NAME: form.API_COMPANY_NAME.trim() || null,
          API_USER_NAME: form.API_USER_NAME.trim() || null,
          API_PASSWORD: clearPassword ? null : password || null,
          clear_password: clearPassword,
          API_VEND_PASSWORD: clearVend ? null : vendPassword || null,
          clear_vend_password: clearVend,
          API_TAAS_ID: taasId.trim() || null,
          API_TAAS_PASSWORD: clearTaas ? null : taasPassword || null,
          clear_taas_password: clearTaas,
        },
      } as never),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setPassword("");
      setClearPassword(false);
      setShowPassword(false);
      setShowCompanyName(false);
      setShowUserName(false);
      setVendPassword("");
      setClearVend(false);
      setTaasId("");
      setTaasPassword("");
      setClearTaas(false);
      setShowTaasId(false);
      setShowTaasPassword(false);
      setTestResult(null);
      toast.success("API settings saved");
    },
    onError: (mutationError: Error) => toast.error(mutationError.message || "Could not save API settings"),
  });

  const testMutation = useMutation({
    mutationFn: () => testConnection({ data: { id: softwareId } } as never),
    onSuccess: (result: { status: string; message: string }) => {
      const ok = result.status === "ok";
      setTestResult({ ok, message: result.message });
      if (ok) toast.success(result.message);
      else toast.error(result.message);
    },
    onError: () => {
      setTestResult({ ok: false, message: "Could not test the connection" });
      toast.error("Could not test the connection");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading API settings">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-40 animate-pulse rounded-2xl border border-border bg-background" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
        {(error as Error)?.message ?? "Could not load API settings"}
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      aria-busy={saveMutation.isPending}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!validate()) {
          toast.error("Fix the highlighted fields before saving");
          return;
        }
        saveMutation.mutate();
      }}
    >
      {!data?.configured && (
        <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          API settings have not been configured for this vending software yet.
        </div>
      )}

      {SECTIONS.map((section) => (
        <section key={section.title} className="rounded-2xl border border-border bg-background p-5">
          <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => {
              const fieldError = errors[field.key];
              const url = URL_KEYS.includes(field.key);
              return (
                <div key={field.key} className="space-y-1.5">
                  <label htmlFor={`software-${field.key}`} className="text-sm font-medium text-foreground">
                    {field.label}{field.required ? " *" : ""}
                  </label>
                  <input
                    id={`software-${field.key}`}
                    type={url ? "url" : "text"}
                    inputMode={url ? "url" : "text"}
                    autoComplete="off"
                    value={form[field.key]}
                    maxLength={500}
                    placeholder={url ? "https://…" : ""}
                    onChange={(event) => set(field.key, event.target.value)}
                    aria-invalid={Boolean(fieldError)}
                    className={`h-11 w-full rounded-xl border bg-card px-3 text-sm ${fieldError ? "border-destructive" : "border-border"}`}
                  />
                  <p className={`text-xs ${fieldError ? "text-destructive" : "text-muted-foreground"}`}>
                    {fieldError ?? field.helper}
                  </p>
                </div>
              );
            })}

            {section.title === "API Account Credentials" && isIcon && (
              <>
              <div className="space-y-1.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
                <label htmlFor="software-api-taas-id" className="text-sm font-medium text-foreground">API TaaS ID *</label>
                <div className="flex gap-2">
                  <input
                    id="software-api-taas-id"
                    type={showTaasId ? "text" : "password"}
                    autoComplete="off"
                    value={taasId}
                    maxLength={150}
                    placeholder={settings?.has_taas_id ? "••••••••" : "Enter TaaS ID"}
                    onChange={(e) => { setTaasId(e.target.value); setErrors((p) => ({ ...p, API_TAAS_ID: undefined })); }}
                    aria-invalid={Boolean(errors.API_TAAS_ID)}
                    className={`h-11 w-full rounded-xl border bg-card px-3 text-sm ${errors.API_TAAS_ID ? "border-destructive" : "border-border"}`}
                  />
                  <Button type="button" variant="outline" size="icon" className="size-11 shrink-0 rounded-xl" onClick={() => setShowTaasId((v) => !v)} aria-label={showTaasId ? "Hide TaaS ID" : "Show TaaS ID"}>
                    {showTaasId ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {errors.API_TAAS_ID && <p className="text-xs text-destructive">{errors.API_TAAS_ID}</p>}
                <p className="text-xs text-muted-foreground">
                  {settings?.has_taas_id ? "A TaaS ID is configured. Leave blank to keep it unchanged." : "TaaS account ID issued by Icon-Token (sent as taasid)."}
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
                <label htmlFor="software-api-taas-password" className="text-sm font-medium text-foreground">API TaaS Password *</label>
                <div className="flex gap-2">
                  <input
                    id="software-api-taas-password"
                    type={showTaasPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={taasPassword}
                    disabled={clearTaas}
                    maxLength={200}
                    placeholder={settings?.has_taas_password ? "••••••••" : "Enter TaaS password"}
                    onChange={(e) => { setTaasPassword(e.target.value); setErrors((p) => ({ ...p, API_TAAS_PASSWORD: undefined })); }}
                    aria-invalid={Boolean(errors.API_TAAS_PASSWORD)}
                    className={`h-11 w-full rounded-xl border bg-card px-3 text-sm disabled:opacity-60 ${errors.API_TAAS_PASSWORD ? "border-destructive" : "border-border"}`}
                  />
                  <Button type="button" variant="outline" size="icon" className="size-11 shrink-0 rounded-xl" onClick={() => setShowTaasPassword((v) => !v)} aria-label={showTaasPassword ? "Hide TaaS password" : "Show TaaS password"}>
                    {showTaasPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {errors.API_TAAS_PASSWORD && <p className="text-xs text-destructive">{errors.API_TAAS_PASSWORD}</p>}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={clearTaas} onChange={(e) => { setClearTaas(e.target.checked); if (e.target.checked) setTaasPassword(""); }} />
                  Remove the stored TaaS password
                </label>
                <p className="text-xs text-muted-foreground">
                  {settings?.has_taas_password ? "A TaaS password is configured. Leave blank to keep it unchanged." : "Password for the TaaS account (sent as taaspasswd)."}
                </p>
              </div>
              </>
            )}
            {section.title === "API Account Credentials" && !isIcon && (
              <>
              <div className="space-y-1.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
                <label htmlFor="software-api-company" className="text-sm font-medium text-foreground">
                  API Company Name *
                </label>
                <div className="flex gap-2">
                  <input
                    id="software-api-company"
                    type={showCompanyName ? "text" : "password"}
                    autoComplete="off"
                    value={form.API_COMPANY_NAME}
                    maxLength={150}
                    placeholder={settings?.has_company_name ? "••••••••" : "Enter API company name"}
                    onChange={(event) => set("API_COMPANY_NAME", event.target.value)}
                    aria-invalid={Boolean(errors.API_COMPANY_NAME)}
                    className={`h-11 w-full rounded-xl border bg-card px-3 text-sm ${errors.API_COMPANY_NAME ? "border-destructive" : "border-border"}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11 shrink-0 rounded-xl"
                    onClick={() => setShowCompanyName((visible) => !visible)}
                    aria-label={showCompanyName ? "Hide company name" : "Show company name"}
                    title={showCompanyName ? "Hide company name" : "Show company name"}
                  >
                    {showCompanyName ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {errors.API_COMPANY_NAME && <p className="text-xs text-destructive">{errors.API_COMPANY_NAME}</p>}
                <p className="text-xs text-muted-foreground">
                  {settings?.has_company_name
                    ? "A company name is configured. Leave blank to keep it unchanged."
                    : "Company identifier issued by the vending software provider. Enter one before saving."}
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
                <label htmlFor="software-api-user" className="text-sm font-medium text-foreground">
                  API User Name *
                </label>
                <div className="flex gap-2">
                  <input
                    id="software-api-user"
                    type={showUserName ? "text" : "password"}
                    autoComplete="off"
                    value={form.API_USER_NAME}
                    maxLength={150}
                    placeholder={settings?.has_user_name ? "••••••••" : "Enter API user name"}
                    onChange={(event) => set("API_USER_NAME", event.target.value)}
                    aria-invalid={Boolean(errors.API_USER_NAME)}
                    className={`h-11 w-full rounded-xl border bg-card px-3 text-sm ${errors.API_USER_NAME ? "border-destructive" : "border-border"}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11 shrink-0 rounded-xl"
                    onClick={() => setShowUserName((visible) => !visible)}
                    aria-label={showUserName ? "Hide user name" : "Show user name"}
                    title={showUserName ? "Hide user name" : "Show user name"}
                  >
                    {showUserName ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {errors.API_USER_NAME && <p className="text-xs text-destructive">{errors.API_USER_NAME}</p>}
                <p className="text-xs text-muted-foreground">
                  {settings?.has_user_name
                    ? "A user name is configured. Leave blank to keep it unchanged."
                    : "Username issued by the vending software provider. Enter one before saving."}
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
                <label htmlFor="software-api-password" className="text-sm font-medium text-foreground">
                  API Password *
                </label>
                <div className="flex gap-2">
                  <input
                    id="software-api-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    disabled={clearPassword}
                    maxLength={200}
                    placeholder={settings?.has_password ? "••••••••" : "Enter API password"}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setErrors((previous) => {
                        const next = { ...previous };
                        delete next.API_PASSWORD;
                        return next;
                      });
                    }}
                    aria-invalid={Boolean(errors.API_PASSWORD)}
                    className={`h-11 w-full rounded-xl border bg-card px-3 text-sm disabled:opacity-60 ${errors.API_PASSWORD ? "border-destructive" : "border-border"}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11 shrink-0 rounded-xl"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {errors.API_PASSWORD && <p className="text-xs text-destructive">{errors.API_PASSWORD}</p>}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={clearPassword}
                    onChange={(event) => {
                      setClearPassword(event.target.checked);
                      if (event.target.checked) setPassword("");
                    }}
                  />
                  Remove the stored password
                </label>
                <p className="text-xs text-muted-foreground">
                  {settings?.has_password
                    ? "A password is configured. Leave blank to keep it unchanged."
                    : "No password is configured. Enter one before saving."}
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
                <label htmlFor="software-api-vend-password" className="text-sm font-medium text-foreground">
                  API Vend Password
                </label>
                <input
                  id="software-api-vend-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={vendPassword}
                  disabled={clearVend}
                  maxLength={200}
                  placeholder={settings?.has_vend_password ? "••••••••" : "Same as API Password"}
                  onChange={(event) => setVendPassword(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm disabled:opacity-60"
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={clearVend}
                    onChange={(event) => {
                      setClearVend(event.target.checked);
                      if (event.target.checked) setVendPassword("");
                    }}
                  />
                  Remove the stored vend password
                </label>
                <p className="text-xs text-muted-foreground">
                  {settings?.has_vend_password
                    ? "A vend password is configured. Leave blank to keep it unchanged."
                    : "Separate password required by some providers (e.g. CALIN) to purchase tokens. If empty, the API Password is used."}
                </p>
              </div>
              </>
            )}
          </div>
        </section>
      ))}

      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
            {testMutation.isPending ? <Loader2 className="animate-spin" /> : <PlugZap />}
            {testMutation.isPending ? "Testing…" : "Test API Connection"}
          </Button>
          {testResult && (
            <p className={`text-sm ${testResult.ok ? "text-emerald-600" : "text-destructive"}`} role="status">
              {testResult.message}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={reset} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {saveMutation.isPending ? "Saving…" : "Save API Settings"}
          </Button>
        </div>
      </div>
    </form>
  );
}