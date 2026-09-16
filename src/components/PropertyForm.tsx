import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Building2, Check, ChevronDown, ClipboardCheck, Loader2, MapPin, Save, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { listPropertyOwners } from "@/lib/properties.functions";
import { listZones, listRoutes, listStreets } from "@/lib/zones.functions";
import { COUNTRY_GROUPS, STATE_MAP } from "@/lib/countries";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

const STEPS = [
  { id: "property", label: "Property Details", icon: Building2 },
  { id: "owner", label: "Owner Details", icon: UserRound },
  { id: "address", label: "Address", icon: MapPin },
  { id: "review", label: "Review & Submit", icon: ClipboardCheck },
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
  owner_type: "landlord" | "agent" | "vendor";
  landlord_id: string;
  zone_id: string;
  route_id: string;
  street_id: string;
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
  state: "Nairobi",
  country: "Kenya",
  postal_code: "",
  description: "",
  status: "active",
  number_of_units: "",
  owner_type: "landlord",
  landlord_id: "",
  zone_id: "",
  route_id: "",
  street_id: "",
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
  "w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-sm outline-none transition-all duration-200 placeholder:text-muted-foreground/70 hover:border-muted-foreground/30 focus:border-primary focus:ring-4 focus:ring-primary/10";

export function OptionPicker({
  value,
  options,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No option found.",
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value || placeholder;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            inputClass,
            "flex items-center justify-between text-left",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{selected}</span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command className="w-full">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4 shrink-0",
                      value === option ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CountryPicker({
  value,
  onChange,
  placeholder = "Select country",
}: {
  value: string;
  onChange: (country: string) => void;
  placeholder?: string;
}) {
  return (
    <OptionPicker
      value={value}
      options={COUNTRY_GROUPS.flatMap((g) => g.countries)}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search country…"
      emptyMessage="No country found."
    />
  );
}

export function StatePicker({
  country,
  value,
  onChange,
  placeholder = "State / County",
}: {
  country: string;
  value: string;
  onChange: (state: string) => void;
  placeholder?: string;
}) {
  const options = country ? STATE_MAP[country] : undefined;
  if (!options) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        placeholder={placeholder}
      />
    );
  }
  return (
    <OptionPicker
      value={value}
      options={options}
      onChange={onChange}
      placeholder={`Select ${placeholder.toLowerCase()}`}
      searchPlaceholder={`Search ${placeholder.toLowerCase()}…`}
      emptyMessage={`No ${placeholder.toLowerCase()} found.`}
    />
  );
}


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
  const fetchOwners = useServerFn(listPropertyOwners);
  const ownersQuery = useQuery({
    queryKey: ["owner-options", values.owner_type],
    queryFn: () => fetchOwners({ data: { owner_type: values.owner_type } } as never),
  });
  const owners = (ownersQuery.data?.owners ?? []) as {
    id: string;
    name: string | null;
    email: string | null;
  }[];
  const selectedOwner = owners.find((l) => l.id === values.landlord_id);
  const ownerLabel =
    values.owner_type === "agent" ? "Agent" : values.owner_type === "vendor" ? "Vendor" : "Landlord";

  // Cascading Zone → Route → Street selection for zone-type properties.
  const fetchZones = useServerFn(listZones);
  const fetchRoutes = useServerFn(listRoutes);
  const fetchStreets = useServerFn(listStreets);
  const zonesQuery = useQuery({
    queryKey: ["zone-options"],
    queryFn: () => fetchZones(),
    enabled: values.property_type === "zone",
  });
  const zones = (zonesQuery.data?.zones ?? []) as {
    zone_id: number;
    zone_name: string;
  }[];
  const routesQuery = useQuery({
    queryKey: ["route-options", values.zone_id],
    queryFn: () => fetchRoutes({ data: { zone_id: Number(values.zone_id) } } as never),
    enabled: values.property_type === "zone" && Boolean(values.zone_id),
  });
  const routes = (routesQuery.data?.routes ?? []) as {
    route_id: number;
    route_code: string;
    route_name: string;
  }[];
  const streetsQuery = useQuery({
    queryKey: ["street-options", values.route_id],
    queryFn: () => fetchStreets({ data: { route_id: Number(values.route_id) } } as never),
    enabled: values.property_type === "zone" && Boolean(values.route_id),
  });
  const streets = (streetsQuery.data?.streets ?? []) as {
    street_id: number;
    street_name: string;
  }[];
  const selectedZone = zones.find((z) => String(z.zone_id) === values.zone_id);
  const selectedRoute = routes.find((r) => String(r.route_id) === values.route_id);
  const selectedStreet = streets.find((s) => String(s.street_id) === values.street_id);

  const set = <K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Legacy records (e.g. Country = Kenya with no county) must pick a valid
  // state/county before they can be saved again.
  const [legacyStateNotice, setLegacyStateNotice] = useState(
    Boolean(initial.country && STATE_MAP[initial.country] && !initial.state.trim()),
  );
  useEffect(() => {
    if (!legacyStateNotice) return;
    setStep(2);
    setErrors({ state: `Select a valid state/county for ${initial.country}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (legacyStateNotice && values.state.trim()) setLegacyStateNotice(false);
  }, [legacyStateNotice, values.state]);

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
      if (values.property_type === "zone") {
        if (!values.zone_id) next["zone_id"] = "Please select a zone";
        if (!values.route_id) next["route_id"] = "Please select a route";
      } else if (values.name.trim().length < 2) {
        next["name"] = "Property name must be at least 2 characters";
      }
    }
    if (index === 1) {
      if (values.number_of_units.trim()) {
        if (!/^\d+$/.test(values.number_of_units.trim()))
          next["number_of_units"] = "Number of units must be a whole number";
        else if (Number(values.number_of_units) > 100000)
          next["number_of_units"] = "Number of units is too large";
      }
      if (Number(values.number_of_units) > 0 && !values.landlord_id.trim()) {
        next["landlord_id"] = `A ${ownerLabel.toLowerCase()} is required when units are greater than 0`;
      }
    }
    if (index === 2) {
      if (!values.country.trim()) next["country"] = "Country is required";
      if (!values.state.trim()) {
        next["state"] = "State / County is required";
      } else if (values.country) {
        const states = STATE_MAP[values.country];
        if (states && !states.includes(values.state)) {
          next["state"] = `Please select a valid state/county for ${values.country}`;
        }
      }
      if (values.postal_code && values.postal_code.trim().length > 30)
        next["postal_code"] = "Postal code is too long";
    }
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

  const isLast = step === STEPS.length - 1;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const next = { ...validateStep(0), ...validateStep(1), ...validateStep(2) };
    setErrors(next);
    if (Object.keys(next).length) {
      const failing = [0, 1, 2].find((i) => Object.keys(validateStep(i)).length);
      if (failing !== undefined) setStep(failing);
      return;
    }
    if (!isLast) {
      // Stop premature auto-submission: only the Review step can actually submit.
      goToStep(step + 1);
      return;
    }
    onSubmit({ ...values, name: values.name.trim() });
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <ol className="relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-start sm:gap-0">
        <span
          aria-hidden
          className="absolute left-12 right-12 top-11 hidden h-0.5 rounded bg-border sm:block"
        />
        <span
          aria-hidden
          className="absolute left-12 top-11 hidden h-0.5 rounded bg-primary transition-all duration-500 sm:block"
          style={{ width: `calc((100% - 6rem) * ${step / (STEPS.length - 1)})` }}
        />
        {STEPS.map((s, index) => {
          const Icon = s.icon;
          const active = index === step;
          const done = index < step;
          return (
            <li key={s.id} className="relative z-10 flex flex-1">
              <button
                type="button"
                onClick={() => goToStep(index)}
                aria-current={active ? "step" : undefined}
                className="group flex flex-1 items-center gap-3 text-left sm:flex-col sm:items-center sm:gap-2 sm:text-center"
              >
                <span
                  className={
                    active
                      ? "flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-primary/15 transition-all duration-300"
                      : done
                        ? "flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-4 ring-card transition-all duration-300 group-hover:bg-primary/25"
                        : "flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground ring-4 ring-card transition-all duration-300 group-hover:border-primary/40 group-hover:text-primary"
                  }
                >
                  {done ? <Check className="size-5" /> : <Icon className="size-5" />}
                </span>
                <span className="min-w-0">
                  <span
                    className={
                      active
                        ? "block text-[11px] font-bold uppercase tracking-widest text-primary"
                        : "block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                    }
                  >
                    Step {index + 1}
                  </span>
                  <span
                    className={
                      active
                        ? "block truncate text-sm font-bold text-foreground"
                        : done
                          ? "block truncate text-sm font-semibold text-foreground/80"
                          : "block truncate text-sm font-medium text-muted-foreground"
                    }
                  >
                    {s.label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {legacyStateNotice ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground"
        >
          <MapPin className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Missing state / county</p>
            <p className="text-muted-foreground">
              This property has Country set to {initial.country} but no state/county saved. Select a valid
              option in the Address step before saving.
            </p>
          </div>
        </div>
      ) : null}

      <div key={step} className="fade-swap">

      <section className={step === 0 ? "rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8" : "hidden"}>
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">Property details</h2>
            <p className="text-xs text-muted-foreground">Choose the property type and its core details.</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Property Type <span className="text-destructive">*</span>
            </span>
            <div
              role="radiogroup"
              aria-label="Property type (required)"
              aria-required="true"
              aria-invalid={!!errors["property_type"]}
              className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1.5"
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
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Building Category <span className="text-destructive">*</span>
              </span>
              <div
                role="radiogroup"
                aria-label="Building category (required)"
                aria-required="true"
                aria-invalid={!!errors["building_category"]}
                className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1.5"
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
              <Field label="Zone *" error={errors["zone_id"]}>
                <select
                  value={values.zone_id}
                  onChange={(e) => {
                    const zoneId = e.target.value;
                    const zone = zones.find((z) => String(z.zone_id) === zoneId);
                    setValues((prev) => ({
                      ...prev,
                      zone_id: zoneId,
                      route_id: "",
                      street_id: "",
                      name: zone?.zone_name ?? "",
                      code: "",
                    }));
                  }}
                  className={inputClass}
                  disabled={zonesQuery.isLoading}
                >
                  <option value="">
                    {zonesQuery.isLoading ? "Loading zones…" : "Select zone"}
                  </option>
                  {zones.map((z) => (
                    <option key={z.zone_id} value={z.zone_id}>
                      {z.zone_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Route *" error={errors["route_id"]}>
                <select
                  value={values.route_id}
                  onChange={(e) => {
                    const routeId = e.target.value;
                    const route = routes.find((r) => String(r.route_id) === routeId);
                    setValues((prev) => ({
                      ...prev,
                      route_id: routeId,
                      street_id: "",
                      code: route?.route_code ?? "",
                    }));
                  }}
                  className={inputClass}
                  disabled={!values.zone_id || routesQuery.isLoading}
                >
                  <option value="">
                    {!values.zone_id
                      ? "Select a zone first"
                      : routesQuery.isLoading
                        ? "Loading routes…"
                        : "Select route"}
                  </option>
                  {routes.map((r) => (
                    <option key={r.route_id} value={r.route_id}>
                      {r.route_code} — {r.route_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Street">
                <select
                  value={values.street_id}
                  onChange={(e) => set("street_id", e.target.value)}
                  className={inputClass}
                  disabled={!values.route_id || streetsQuery.isLoading}
                >
                  <option value="">
                    {!values.route_id
                      ? "Select a route first"
                      : streetsQuery.isLoading
                        ? "Loading streets…"
                        : "Select street (optional)"}
                  </option>
                  {streets.map((s) => (
                    <option key={s.street_id} value={s.street_id}>
                      {s.street_name}
                    </option>
                  ))}
                </select>
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

      <section className={step === 1 ? "rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8" : "hidden"}>
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRound className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">Owner details</h2>
            <p className="text-xs text-muted-foreground">Assign the number of units and the property owner.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
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
          <Field label="Select Owner" error={errors["owner_type"]}>
            <select
              value={values.owner_type}
              onChange={(e) => {
                set("owner_type", e.target.value as PropertyFormValues["owner_type"]);
                set("landlord_id", "");
              }}
              className={inputClass}
            >
              <option value="landlord">Landlord</option>
              <option value="agent">Agent</option>
              <option value="vendor">Vendor</option>
            </select>
          </Field>
          <Field label={`Select ${ownerLabel}`} error={errors["landlord_id"]}>
            <select
              value={values.landlord_id}
              onChange={(e) => set("landlord_id", e.target.value)}
              className={inputClass}
              disabled={ownersQuery.isLoading}
            >
              <option value="">
                {ownersQuery.isLoading
                  ? `Loading ${ownerLabel.toLowerCase()}s…`
                  : `Select ${ownerLabel.toLowerCase()}`}
              </option>
              {owners.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || l.email || l.id}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {!ownersQuery.isLoading && owners.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            No {ownerLabel.toLowerCase()} accounts found. Add one from {ownerLabel} Management first.
          </p>
        )}
      </section>

      <section className={step === 2 ? "rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8" : "hidden"}>
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPin className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">Address</h2>
            <p className="text-xs text-muted-foreground">Where is this property located?</p>
          </div>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
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
          <Field label="Country *" error={errors["country"]}>
            <CountryPicker
              value={values.country}
              onChange={(country) => {
                set("country", country);
                const allowed = country ? STATE_MAP[country] : undefined;
                if (allowed && !allowed.includes(values.state)) {
                  set("state", "");
                }
              }}
              placeholder="Select country"
            />
          </Field>
          <Field label="State / County *" error={errors["state"]}>
            <StatePicker
              country={values.country}
              value={values.state}
              onChange={(state) => set("state", state)}
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

      <section className={step === 3 ? "rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8" : "hidden"}>
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardCheck className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">Review & Submit</h2>
            <p className="text-xs text-muted-foreground">Confirm the details before saving.</p>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
              <Building2 className="size-4" /> Property Details
            </h3>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Property Type</dt>
                <dd className="mt-1 text-sm font-medium text-foreground capitalize">{values.property_type}</dd>
              </div>
              {values.property_type === "building" && (
                <>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Building Category</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground capitalize">{values.building_category}</dd>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Type</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{values.subtype || "—"}</dd>
                  </div>
                </>
              )}
              {values.property_type === "zone" ? (
                <>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Zone</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {selectedZone?.zone_name ?? values.name ?? "—"}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Route</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {selectedRoute ? `${selectedRoute.route_code} — ${selectedRoute.route_name}` : values.code || "—"}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Street</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {selectedStreet?.street_name ?? "—"}
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Property Name</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{values.name || "—"}</dd>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Property Code</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{values.code || "—"}</dd>
                  </div>
                </>
              )}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
                <dd className="mt-1 text-sm font-medium text-foreground capitalize">{values.status}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Description</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{values.description || "—"}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
              <UserRound className="size-4" /> Owner Details
            </h3>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Number of Units</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{values.number_of_units || "0"}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Owner Type</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{ownerLabel}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Assigned {ownerLabel}</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {selectedOwner ? selectedOwner.name || selectedOwner.email : values.landlord_id ? "Unknown" : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
              <MapPin className="size-4" /> Address
            </h3>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Address Line 1</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{values.address_line1 || "—"}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Address Line 2</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{values.address_line2 || "—"}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">City</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{values.city || "—"}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Country</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{values.country || "—"}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">State / County</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{values.state || "—"}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Postal Code</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{values.postal_code || "—"}</dd>
              </div>
            </dl>
          </div>
        </div>

        {Object.keys(errors).length > 0 && (
          <div className="mt-5 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-xs font-semibold text-destructive">Please fix the following issues before submitting:</p>
            <ul className="mt-1 list-inside list-disc text-xs text-destructive">
              {Object.entries(errors).map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => goToStep(step - 1)}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-semibold transition-all hover:bg-accent/10 disabled:opacity-50"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              onClick={() => goToStep(step + 1)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 active:scale-95"
            >
              Next
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {pending ? "Saving…" : submitLabel}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
