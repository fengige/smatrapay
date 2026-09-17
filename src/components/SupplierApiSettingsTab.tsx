import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Loader2, PlugZap, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteSupplierApiSettings,
  getSupplierApiSettings,
  saveSupplierApiSettings,
  testSupplierApiConnection,
} from "@/lib/suppliers.functions";

type FormState = {
  API_POS_PURCHASE: string;
  API_LOGIN: string;
  API_MAINTENANCE_CLEAR_TAMPER: string;
  API_MAINTENANCE_CLEAR_CREDIT: string;
  API_MAINTENANCE_SET_OVERDRAFT_LIMIT: string;
  API_COMPANY_NAME: string;
  API_USER_NAME: string;
};

const EMPTY: FormState = {
  API_POS_PURCHASE: "",
  API_LOGIN: "",
  API_MAINTENANCE_CLEAR_TAMPER: "",
  API_MAINTENANCE_CLEAR_CREDIT: "",
  API_MAINTENANCE_SET_OVERDRAFT_LIMIT: "",
  API_COMPANY_NAME: "",
  API_USER_NAME: "",
};

const URL_KEYS: (keyof FormState)[] = [
  "API_POS_PURCHASE",
  "API_LOGIN",
  "API_MAINTENANCE_CLEAR_TAMPER",
  "API_MAINTENANCE_CLEAR_CREDIT",
  "API_MAINTENANCE_SET_OVERDRAFT_LIMIT",
];

const SECTIONS: {
  title: string;
  description: string;
  fields: { key: keyof FormState; label: string; hint: string }[];
}[] = [
  {
    title: "Purchase & Authentication APIs",
    description: "Endpoints used when selling tokens and signing in to the supplier system.",
    fields: [
      {
        key: "API_POS_PURCHASE",
        label: "API POS Purchase",
        hint: "Endpoint called to purchase a token at the point of sale.",
      },
      {
        key: "API_LOGIN",
        label: "API Login",
        hint: "Endpoint used to authenticate with the supplier before other calls.",
      },
    ],
  },
  {
    title: "Maintenance APIs",
    description: "Endpoints used for meter maintenance operations.",
    fields: [
      {
        key: "API_MAINTENANCE_CLEAR_TAMPER",
        label: "API Maintenance Clear Tamper",
        hint: "Endpoint that issues a clear tamper token.",
      },
      {
        key: "API_MAINTENANCE_CLEAR_CREDIT",
        label: "API Maintenance Clear Credit",
        hint: "Endpoint that issues a clear credit token.",
      },
      {
        key: "API_MAINTENANCE_SET_OVERDRAFT_LIMIT",
        label: "API Maintenance Set Overdraft Limit",
        hint: "Endpoint that sets a meter's maximum overdraft limit.",
      },
    ],
  },
  {
    title: "API Account Credentials",
    description: "The account this system uses when calling the supplier.",
    fields: [
      { key: "API_COMPANY_NAME", label: "API Company Name", hint: "Company identifier issued by the supplier." },
      { key: "API_USER_NAME", label: "API User Name", hint: "Username issued by the supplier." },
    ],
  },
];

const isUrl = (v: string) => /^https?:\/\/[^\s]+$/i.test(v);

export function SupplierApiSettingsTab({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getSupplierApiSettings);
  const save = useServerFn(saveSupplierApiSettings);
  const testConnection = useServerFn(testSupplierApiConnection);
  const removeSettings = useServerFn(deleteSupplierApiSettings);

  const [softwareId, setSoftwareId] = useState<string | null>(null);

  const queryKey = ["supplier-api-settings", supplierId, softwareId ?? "default"];
  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => load({ data: { id: supplierId, vending_software_id: softwareId } } as never),
  });

  const settings = data?.settings;
  const softwareOptions = data?.software ?? [];
  const [form, setForm] = useState<FormState>(EMPTY);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [testResult, setTestResult] = useState<string | null>(null);

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
      setErrors({});
    },
    [settings],
  );

  useEffect(() => {
    reset();
  }, [reset]);

  const set = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validate() {
    const next: Partial<Record<keyof FormState, string>> = {};
    for (const key of URL_KEYS) {
      const value = form[key].trim();
      if (value && !isUrl(value)) next[key] = "Enter a valid URL starting with http:// or https://";
    }
    const filled = URL_KEYS.map((k) => form[k].trim()).filter(Boolean);
    if (new Set(filled).size !== filled.length) {
      for (const key of URL_KEYS) {
        const v = form[key].trim();
        if (v && filled.filter((f) => f === v).length > 1) next[key] = "This URL is used by another endpoint";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          supplier_id: supplierId,
          ...Object.fromEntries(
            (Object.keys(form) as (keyof FormState)[]).map((k) => [k, form[k].trim()]),
          ),
          API_PASSWORD: clearPassword ? null : password || null,
          clear_password: clearPassword,
        },
      } as never),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setPassword("");
      setClearPassword(false);
      setShowPassword(false);
      setTestResult(null);
      toast.success("API settings saved");
    },
    onError: (e: Error) => toast.error(e.message || "Could not save API settings"),
  });

  const testMutation = useMutation({
    mutationFn: () => testConnection({ data: { id: supplierId } } as never),
    onSuccess: (result: { status: string; message: string }) => {
      setTestResult(result.message);
      if (result.status === "ok") toast.success(result.message);
      else toast.error(result.message);
    },
    onError: (e: Error) => toast.error(e.message || "Could not test the connection"),
  });

  if (isLoading) {
    return (
      <div className="mt-5 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-5 rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
        {(error as Error)?.message ?? "Could not load API settings"}
      </div>
    );
  }

  return (
    <form
      className="mt-5 space-y-4"
      aria-busy={saveMutation.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        if (!validate()) {
          toast.error("Fix the highlighted fields before saving");
          return;
        }
        saveMutation.mutate();
      }}
    >
      {SECTIONS.map((section) => (
        <section key={section.title} className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => {
              const id = `api-${field.key}`;
              const fieldError = errors[field.key];
              return (
                <div key={field.key} className="space-y-1.5">
                  <label htmlFor={id} className="text-sm font-medium text-foreground">
                    {field.label}
                  </label>
                  <input
                    id={id}
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    value={form[field.key]}
                    maxLength={500}
                    title={field.hint}
                    placeholder={URL_KEYS.includes(field.key) ? "https://…" : ""}
                    onChange={(e) => set(field.key, e.target.value)}
                    aria-invalid={Boolean(fieldError)}
                    className={`h-11 w-full rounded-xl border bg-background px-3 text-sm ${
                      fieldError ? "border-destructive" : "border-border"
                    }`}
                  />
                  {fieldError ? (
                    <p className="text-xs text-destructive">{fieldError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{field.hint}</p>
                  )}
                </div>
              );
            })}

            {section.title === "API Account Credentials" && (
              <div className="space-y-1.5">
                <label htmlFor="api-password" className="text-sm font-medium text-foreground">
                  API Password
                </label>
                <div className="flex gap-2">
                  <input
                    id="api-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    disabled={clearPassword}
                    maxLength={200}
                    placeholder={settings?.has_password ? "••••••••" : "Enter API password"}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-accent/10"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={clearPassword}
                    onChange={(e) => {
                      setClearPassword(e.target.checked);
                      if (e.target.checked) setPassword("");
                    }}
                  />
                  Remove the stored password
                </label>
                <p className="text-xs text-muted-foreground">
                  {settings?.has_password
                    ? "A password is configured. Leave blank to keep it unchanged."
                    : "No password configured yet."}
                </p>
              </div>
            )}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-60"
          >
            {testMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlugZap className="size-4" />
            )}
            Test API Connection
          </button>
          {testResult && <p className="text-sm text-muted-foreground">{testResult}</p>}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {saveMutation.isPending ? "Saving…" : "Save API Settings"}
          </button>
        </div>
      </div>
    </form>
  );
}
