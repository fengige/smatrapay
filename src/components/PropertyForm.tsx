import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Building2, Check, Loader2, MapPin, Save, UserRound } from "lucide-react";

import { listLandlords } from "@/lib/properties.functions";

const STEPS = [
  { id: "property", label: "Property Details", icon: Building2 },
  { id: "landlord", label: "Landlord Details", icon: UserRound },
  { id: "address", label: "Address", icon: MapPin },
] as const;

export const RESIDENTIAL_TYPES = [
  "Apartments",
  "Bungalows",
  "Maisonettes",
  "Townhouses",
  "Villas",
  "Land",
] as const;

export const COMMERCIAL_TYPES = [
  "Office Spaces",
  "Retail Spaces",
  "Industrial Spaces",
  "Land",
] as const;

export type PropertyFormValues = {
  property_type: "building" | "zone";
  building_category: "residential" | "commercial" | "";
  subtype: string;
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
  number_of_units: string;
  landlord_id: string;
};

export const emptyProperty: PropertyFormValues = {
  property_type: "building",
  building_category: "residential",
  subtype: "",
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
  number_of_units: "",
  landlord_id: "",
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
  const [step, setStep] = useState(0);
  const fetchLandlords = useServerFn(listLandlords);
  const landlordsQuery = useQuery({
    queryKey: ["landlord-options"],
    queryFn: () => fetchLandlords(),
  });
  const landlords = landlordsQuery.data?.landlords ?? [];

  const set = <K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const validateStep = (index: number) => {
    const next: Record<string, string> = {};
    if (index === 0) {
      if (values.property_type !== "building" && values.property_type !== "zone")
        next["property_type"] = "Please select Building or Zone";
      if (values.property_type === "building") {
        if (values.building_category !== "residential" && values.building_category !== "commercial")
          next["building_category"] = "Please select Residential or Commercial";
        else if (!values.subtype)
          next["subtype"] =
            values.building_category === "residential"
              ? "Please select a residential type"
              : "Please select a commercial type";
      }
      if (values.name.trim().length < 2)
        next["name"] =
          values.property_type === "zone"
            ? "Zone name must be at least 2 characters"
            : "Property name must be at least 2 characters";
    }
    if (index === 1 && values.number_of_units.trim()) {
      if (!/^\d+$/.test(values.number_of_units.trim()))
        next["number_of_units"] = "Number of units must be a whole number";
      else if (Number(values.number_of_units) > 100000)
        next["number_of_units"] = "Number of units is too large";
    }
    if (index === 2 && values.postal_code && values.postal_code.trim().length > 30)
      next["postal_code"] = "Postal code is too long";
    return next;
  };

  const goToStep = (target: number) => {
    if (target > step) {
      for (let i = step; i < target; i += 1) {
        const stepErrors = validateStep(i);
        if (Object.keys(stepErrors).length) {
          setErrors(stepErrors);
          setStep(i);
          return;
        }
      }
    }
    setErrors({});
    setStep(target);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = { ...validateStep(0), ...validateStep(1), ...validateStep(2) };
    setErrors(next);
    if (Object.keys(next).length) {
      const failing = [0, 1, 2].find((i) => Object.keys(validateStep(i)).length);
      if (failing !== undefined) setStep(failing);
      return;
    }
    onSubmit({ ...values, name: values.name.trim() });
  };

  const isLast = step === STEPS.length - 1;

  return (
    <form onSubmit={submit} className="space-y-5">
      <ol className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
        {STEPS.map((s, index) => {
          const Icon = s.icon;
          const active = index === step;
          const done = index < step;
          return (
            <li key={s.id} className="flex flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => goToStep(index)}
                aria-current={active ? "step" : undefined}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <span
                  className={
                    active
                      ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
                      : done
                        ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
                        : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                  }
                >
                  {done ? <Check className="size-5" /> : <Icon className="size-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Step {index + 1}
                  </span>
                  <span
                    className={
                      active
                        ? "block truncate text-sm font-bold text-foreground"
                        : "block truncate text-sm font-medium text-muted-foreground"
                    }
                  >
                    {s.label}
                  </span>
                </span>
              </button>
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={
                    done
                      ? "hidden h-0.5 flex-1 rounded bg-primary sm:block"
                      : "hidden h-0.5 flex-1 rounded bg-border sm:block"
                  }
                />
              )}
            </li>
          );
        })}
      </ol>

      <section className={step === 0 ? "rounded-2xl border border-border bg-card p-5" : "hidden"}>
        <h2 className="text-sm font-bold text-foreground">Property details</h2>


        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div
              role="radiogroup"
              aria-label="Property type (required)"
              aria-required="true"
              aria-invalid={!!errors["property_type"]}
              className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1"
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
                    onClick={() =>
                      setValues((prev) => ({
                        ...prev,
                        property_type: option.value,
                        building_category:
                          option.value === "building" ? prev.building_category || "residential" : "",
                        subtype: option.value === "building" ? prev.subtype : "",
                      }))
                    }
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
          </div>

          {values.property_type === "building" && (
            <div>
              <div
                role="radiogroup"
                aria-label="Building category (required)"
                aria-required="true"
                aria-invalid={!!errors["building_category"]}
                className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1"
              >
                {(
                  [
                    { value: "residential", label: "Residential" },
                    { value: "commercial", label: "Commercial" },
                  ] as const
                ).map((option) => {
                  const selected = values.building_category === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() =>
                        setValues((prev) => ({
                          ...prev,
                          building_category: option.value,
                          subtype: "",
                        }))
                      }
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
              {errors["building_category"] && (
                <p className="mt-1.5 text-xs font-medium text-destructive">
                  {errors["building_category"]}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {values.property_type === "building" && values.building_category === "residential" && (
            <Field label="Residential Type *" error={errors["subtype"]}>
              <select
                value={values.subtype}
                onChange={(e) => set("subtype", e.target.value)}
                className={inputClass}
              >
                <option value="">Select residential type</option>
                {RESIDENTIAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {values.property_type === "building" && values.building_category === "commercial" && (
            <Field label="Commercial Type *" error={errors["subtype"]}>
              <select
                value={values.subtype}
                onChange={(e) => set("subtype", e.target.value)}
                className={inputClass}
              >
                <option value="">Select commercial type</option>
                {COMMERCIAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {values.property_type === "zone" ? (
            <>
              <Field label="Zone name *" error={errors["name"]}>
                <input
                  value={values.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={inputClass}
                  placeholder="Greenfield Zone"
                />
              </Field>
              <Field label="Zone code">
                <input
                  value={values.code}
                  onChange={(e) => set("code", e.target.value)}
                  className={inputClass}
                  placeholder="GFD-01"
                />
              </Field>
            </>
          ) : values.property_type === "building" ? (
            <>
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
            </>
          ) : null}
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

      <section className={step === 1 ? "rounded-2xl border border-border bg-card p-5" : "hidden"}>
        <h2 className="text-sm font-bold text-foreground">Landlord details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Number of Units" error={errors["number_of_units"]}>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={values.number_of_units}
              onChange={(e) => set("number_of_units", e.target.value.replace(/[^0-9]/g, ""))}
              className={inputClass}
              placeholder="e.g. 24"
            />
          </Field>
          <Field label="Select Landlord">
            <select
              value={values.landlord_id}
              onChange={(e) => set("landlord_id", e.target.value)}
              className={inputClass}
              disabled={landlordsQuery.isLoading}
            >
              <option value="">
                {landlordsQuery.isLoading ? "Loading landlords…" : "Select landlord"}
              </option>
              {landlords.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || l.email || l.id}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {!landlordsQuery.isLoading && landlords.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            No landlord accounts found. Add one from Landlord Management first.
          </p>
        )}
      </section>

      <section className={step === 2 ? "rounded-2xl border border-border bg-card p-5" : "hidden"}>
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

      <div className="flex flex-wrap items-center gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => goToStep(step - 1)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <ArrowLeft className="size-4" />
            Back
          </button>
        )}
        {!isLast ? (
          <button
            type="button"
            onClick={() => goToStep(step + 1)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Next
            <ArrowRight className="size-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {submitLabel}
          </button>
        )}
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
