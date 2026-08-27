import { useState } from "react";
import { Loader2, Save } from "lucide-react";

export type PropertyFormValues = {
  property_type: "building" | "zone";
  name: string;
  code: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  description: string;
  status: "active" | "archived";
};

export const emptyProperty: PropertyFormValues = {
  property_type: "building",
  name: "",
  code: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  country: "",
  postal_code: "",
  description: "",
  status: "active",
};

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
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {error && <span className="block text-xs font-medium text-destructive">{error}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function PropertyForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: PropertyFormValues;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: PropertyFormValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<PropertyFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (values.property_type !== "building" && values.property_type !== "zone")
      next["property_type"] = "Please select Building or Zone";
    if (values.name.trim().length < 2) next["name"] = "Property name must be at least 2 characters";
    if (values.postal_code && values.postal_code.trim().length > 30)
      next["postal_code"] = "Postal code is too long";
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({ ...values, name: values.name.trim() });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold text-foreground">Property details</h2>
        <div
          role="radiogroup"
          aria-label="Property type (required)"
          aria-required="true"
          aria-invalid={!!errors["property_type"]}
          className="mt-4 grid w-full max-w-md grid-cols-2 gap-1 rounded-xl bg-muted p-1"
        >
          {(
            [
              { value: "building", label: "Building" },
              { value: "zone", label: "Zone" },
            ] as const
          ).map((option) => {
            const selected = values.property_type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => set("property_type", option.value)}
                className={
                  selected
                    ? "rounded-lg bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors"
                    : "rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {errors["property_type"] && (
          <p className="mt-1.5 text-xs font-medium text-destructive">{errors["property_type"]}</p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Property name *" error={errors["name"]}>
            <input
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
              placeholder="Riverside Apartments"
            />
          </Field>
          <Field label="Property code">
            <input
              value={values.code}
              onChange={(e) => set("code", e.target.value)}
              className={inputClass}
              placeholder="RVS-01"
            />
          </Field>
          <Field label="Status">
            <select
              value={values.status}
              onChange={(e) => set("status", e.target.value as "active" | "archived")}
              className={inputClass}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Description">
            <input
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              className={inputClass}
              placeholder="Short description"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold text-foreground">Address</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1">
            <input
              value={values.address_line1}
              onChange={(e) => set("address_line1", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Address line 2">
            <input
              value={values.address_line2}
              onChange={(e) => set("address_line2", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="City">
            <input
              value={values.city}
              onChange={(e) => set("city", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="State / County">
            <input
              value={values.state}
              onChange={(e) => set("state", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Country">
            <input
              value={values.country}
              onChange={(e) => set("country", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Postal code" error={errors["postal_code"]}>
            <input
              value={values.postal_code}
              onChange={(e) => set("postal_code", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
