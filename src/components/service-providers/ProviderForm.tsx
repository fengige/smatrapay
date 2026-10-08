import { AtSign, Phone, Plus, Trash2 } from "lucide-react";

import { COUNTRY_OPTIONS, STATE_MAP } from "@/lib/countries";
import { CatalogPicker } from "@/components/service-providers/CatalogPicker";
import { Field, inputClass } from "@/components/service-providers/ProviderUI";

export type ProviderFormValues = {
  first_name: string;
  middle_name: string;
  last_name: string;
  business_name: string;
  email: string;
  phone: string;
  username: string;
  address: string;
  country: string;
  county: string;
  city: string;
  postal_address: string;
  bio: string;
  notes: string;
  password: string;
  services: { service_name: string; description: string }[];
};

export const emptyProvider: ProviderFormValues = {
  first_name: "",
  middle_name: "",
  last_name: "",
  business_name: "",
  email: "",
  phone: "",
  username: "",
  address: "",
  country: "Kenya",
  county: "",
  city: "",
  postal_address: "",
  bio: "",
  notes: "",
  password: "",
  services: [{ service_name: "", description: "" }],
};

/** Converts zod issues into "field" / "services.0.service_name" keys. */
export function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".") || "form";
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

export function ProviderForm({
  values,
  errors,
  onChange,
  mode,
}: {
  values: ProviderFormValues;
  errors: Record<string, string>;
  onChange: (next: ProviderFormValues) => void;
  mode: "create" | "edit";
}) {
  const set = <K extends keyof ProviderFormValues>(k: K, v: ProviderFormValues[K]) =>
    onChange({ ...values, [k]: v });
  const regions = STATE_MAP[values.country] ?? [];
  const setService = (i: number, k: "service_name" | "description", v: string) =>
    set(
      "services",
      values.services.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)),
    );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Personal Information</h2>
        </header>
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="First Name" required error={errors["first_name"]}>
            <input
              className={inputClass}
              value={values.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </Field>
          <Field label="Middle Name" error={errors["middle_name"]}>
            <input
              className={inputClass}
              value={values.middle_name}
              onChange={(e) => set("middle_name", e.target.value)}
            />
          </Field>
          <Field label="Last Name" required error={errors["last_name"]}>
            <input
              className={inputClass}
              value={values.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-3">
            <Field
              label="Business Name"
              error={errors["business_name"]}
              hint="Optional trading name"
            >
              <input
                className={inputClass}
                placeholder="e.g. Kamau Plumbing Services"
                value={values.business_name}
                onChange={(e) => set("business_name", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Email Address" required error={errors["email"]}>
            <div className="flex overflow-hidden rounded-lg border border-border focus-within:border-primary">
              <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                <AtSign className="size-4" />
              </span>
              <input
                type="email"
                className="w-full bg-background px-3 py-2 text-sm outline-none"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
          </Field>
          <Field label="Phone Number" required error={errors["phone"]}>
            <div className="flex overflow-hidden rounded-lg border border-border focus-within:border-primary">
              <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                <Phone className="size-4" />
              </span>
              <input
                className="w-full bg-background px-3 py-2 text-sm outline-none"
                placeholder="+254 700 000 000"
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
          </Field>
          <Field label="Username" error={errors["username"]}>
            <input
              className={inputClass}
              value={values.username}
              onChange={(e) => set("username", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Address</h2>
        </header>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Address" error={errors["address"]}>
              <input
                className={inputClass}
                value={values.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Country" error={errors["country"]}>
            <select
              className={inputClass}
              value={values.country}
              onChange={(e) => onChange({ ...values, country: e.target.value, county: "" })}
            >
              <option value="">Select country</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="County / Region" error={errors["county"]}>
            {regions.length ? (
              <select
                className={inputClass}
                value={values.county}
                onChange={(e) => set("county", e.target.value)}
              >
                <option value="">Select region</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputClass}
                value={values.county}
                onChange={(e) => set("county", e.target.value)}
              />
            )}
          </Field>
          <Field label="City / Town" error={errors["city"]}>
            <input
              className={inputClass}
              value={values.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>
          <Field label="Postal Address" error={errors["postal_address"]}>
            <input
              className={inputClass}
              placeholder="P.O. Box 12345-00100"
              value={values.postal_address}
              onChange={(e) => set("postal_address", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Account Details</h2>
        </header>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Role">
            <input className={inputClass} value="Service Provider" disabled />
          </Field>
          {mode === "create" && (
            <Field label="Temporary Password" required error={errors["password"]}>
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                placeholder="Min 8 chars, letters and numbers"
                value={values.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label="Bio" error={errors["bio"]}>
              <textarea
                rows={3}
                className={inputClass}
                value={values.bio}
                onChange={(e) => set("bio", e.target.value)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Internal Notes" error={errors["notes"]}>
              <textarea
                rows={2}
                className={inputClass}
                placeholder="Visible to administrators only"
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </section>

      {mode === "create" && (
        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Services Offered</h2>
              <p className="text-xs text-muted-foreground">Add at least one service.</p>
            </div>
            <button
              type="button"
              onClick={() =>
                set("services", [...values.services, { service_name: "", description: "" }])
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent/10"
            >
              <Plus className="size-4" /> Add Service
            </button>
          </header>
          <div className="space-y-3 p-5">
            {errors["services"] && <p className="text-xs text-destructive">{errors["services"]}</p>}
            {values.services.map((s, i) => (
              <div
                key={i}
                className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_2fr_auto]"
              >
                <Field label="Service Name" required error={errors[`services.${i}.service_name`]}>
                  <CatalogPicker
                    value={s.service_name}
                    onPick={(v) =>
                      set(
                        "services",
                        values.services.map((x, idx) => (idx === i ? v : x)),
                      )
                    }
                  />
                  <input
                    className={inputClass}
                    placeholder="e.g. Plumbing"
                    value={s.service_name}
                    onChange={(e) => setService(i, "service_name", e.target.value)}
                  />
                </Field>
                <Field
                  label="Service Description"
                  required
                  error={errors[`services.${i}.description`]}
                >
                  <textarea
                    rows={2}
                    className={inputClass}
                    placeholder="What this service covers"
                    value={s.description}
                    onChange={(e) => setService(i, "description", e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  aria-label={`Remove service ${i + 1}`}
                  disabled={values.services.length === 1}
                  onClick={() =>
                    set(
                      "services",
                      values.services.filter((_, idx) => idx !== i),
                    )
                  }
                  className="self-start rounded-lg p-2 text-destructive hover:bg-destructive/10 disabled:opacity-40 sm:mt-7"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
