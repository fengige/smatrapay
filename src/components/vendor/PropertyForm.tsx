import {
  COMMERCIAL_TYPES,
  CountryPicker,
  OptionPicker,
  RESIDENTIAL_TYPES,
  StatePicker,
} from "@/components/PropertyForm";

export type PropertyFormState = {
  name: string;
  code: string;
  property_type: "building" | "zone";
  building_category: string;
  subtype: string;
  description: string;
  owner_type: "landlord" | "agent" | "vendor";
  landlord_id: string;
  zone_id: string;
  number_of_units: string;
  status: "active" | "archived";
  country: string;
  state: string;
  city: string;
  estate: string;
  street: string;
  building_number: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  latitude: string;
  longitude: string;
};

export const emptyPropertyForm: PropertyFormState = {
  name: "",
  code: "",
  property_type: "building",
  building_category: "residential",
  subtype: "Apartments",
  description: "",
  owner_type: "landlord",
  landlord_id: "",
  zone_id: "",
  number_of_units: "",
  status: "active",
  country: "Kenya",
  state: "",
  city: "",
  estate: "",
  street: "",
  building_number: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
  latitude: "",
  longitude: "",
};

export type OwnerOption = {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
};

export type ZoneOption = { zone_id: number; zone_name: string };

const input =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const label = "text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground";

/** Converts the form's string fields into the payload the server function expects. */
export function propertyPayload(form: PropertyFormState) {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    name: form.name.trim(),
    code: form.code.trim() || null,
    property_type: form.property_type,
    building_category:
      form.property_type === "building" ? (form.building_category as "residential" | "commercial") : null,
    subtype: form.property_type === "building" ? form.subtype.trim() || null : null,
    description: form.description.trim() || null,
    owner_type: form.owner_type,
    landlord_id: form.landlord_id || null,
    zone_id: form.zone_id ? Number(form.zone_id) : null,
    number_of_units: num(form.number_of_units),
    status: form.status,
    country: form.country.trim() || null,
    state: form.state.trim() || null,
    city: form.city.trim() || null,
    estate: form.estate.trim() || null,
    address_line1: [form.building_number.trim(), form.street.trim()].filter(Boolean).join(" ") ||
      form.address_line1.trim() ||
      null,
    address_line2: form.address_line2.trim() || null,
    building_number: form.building_number.trim() || null,
    postal_code: form.postal_code.trim() || null,
    latitude: num(form.latitude),
    longitude: num(form.longitude),
  };
}

export function PropertyFormFields({
  form,
  onChange,
  owners,
  zones,
  section = "all",
  errors = {},
}: {
  form: PropertyFormState;
  onChange: (patch: Partial<PropertyFormState>) => void;
  owners: OwnerOption[];
  zones: ZoneOption[];
  /** Limit which fields render, so a wizard can split them across steps. */
  section?: "all" | "details" | "owner" | "address";
  errors?: Record<string, string>;
}) {
  const ownerChoices = owners.filter((o) => o.roles.includes(form.owner_type));
  const showDetails = section === "all" || section === "details";
  const showOwner = section === "all" || section === "owner";
  const showAddress = section === "all" || section === "address";
  const ownerLabel =
    form.owner_type === "agent" ? "Agent" : form.owner_type === "vendor" ? "Vendor" : "Landlord";
  const subtypeOptions = [
    ...(form.building_category === "commercial" ? COMMERCIAL_TYPES : RESIDENTIAL_TYPES),
  ];
  const err = (key: string) =>
    errors[key] ? (
      <span className="mt-1 block text-xs font-medium text-destructive">{errors[key]}</span>
    ) : null;

  const toggle = (
    name: string,
    value: string,
    options: { value: string; label: string }[],
    onPick: (v: string) => void,
  ) => (
    <div
      role="radiogroup"
      aria-label={name}
      className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1.5"
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(o.value)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5">
      {showDetails && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Property type *</span>
              <div className="mt-1">
                {toggle(
                  "Property type",
                  form.property_type,
                  [
                    { value: "building", label: "Building" },
                    { value: "zone", label: "Zone" },
                  ],
                  (v) => onChange({ property_type: v as "building" | "zone" }),
                )}
              </div>
            </div>

            {form.property_type === "building" && (
              <div>
                <span className={label}>Category *</span>
                <div className="mt-1">
                  {toggle(
                    "Building category",
                    form.building_category,
                    [
                      { value: "residential", label: "Residential" },
                      { value: "commercial", label: "Commercial" },
                    ],
                    (v) => onChange({ building_category: v, subtype: "" }),
                  )}
                </div>
              </div>
            )}

            {form.property_type === "building" && (
              <div>
                <label className={label} htmlFor="p-sub">
                  {form.building_category === "commercial" ? "Commercial type" : "Residential type"} *
                </label>
                <div className="mt-1">
                  <OptionPicker
                    value={form.subtype}
                    options={subtypeOptions}
                    onChange={(v) => onChange({ subtype: v })}
                    placeholder="Select a type"
                    searchPlaceholder="Search type…"
                    emptyMessage="No type found."
                  />
                </div>
                {err("subtype")}
              </div>
            )}

            <div>
              <label className={label} htmlFor="p-name">
                Property name *
              </label>
              <input
                id="p-name"
                className={input}
                value={form.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="e.g. RiverFront Apartments"
              />
              {err("name")}
            </div>

            <div>
              <label className={label} htmlFor="p-code">
                Property ID / reference
              </label>
              <input
                id="p-code"
                className={input}
                value={form.code}
                onChange={(e) => onChange({ code: e.target.value })}
              />
            </div>

            <div>
              <label className={label} htmlFor="p-zone">
                Zone *
              </label>
              <select
                id="p-zone"
                className={input}
                value={form.zone_id}
                onChange={(e) => onChange({ zone_id: e.target.value })}
              >
                <option value="">Select a zone</option>
                {zones.map((z) => (
                  <option key={z.zone_id} value={String(z.zone_id)}>
                    {z.zone_name}
                  </option>
                ))}
              </select>
              {err("zone_id")}
              {!zones.length && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  You have no assigned zones yet.
                </span>
              )}
            </div>
          </div>

          <div>
            <label className={label} htmlFor="p-desc">
              Description
            </label>
            <textarea
              id="p-desc"
              className={input}
              rows={3}
              value={form.description}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </div>
        </div>
      )}

      {showOwner && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="p-owner-type">
              Owner type *
            </label>
            <select
              id="p-owner-type"
              className={input}
              value={form.owner_type}
              onChange={(e) =>
                onChange({
                  owner_type: e.target.value as "landlord" | "agent" | "vendor",
                  landlord_id: "",
                })
              }
            >
              <option value="landlord">Landlord</option>
              <option value="agent">Agent</option>
              <option value="vendor">Vendor</option>
            </select>
          </div>

          <div>
            <label className={label} htmlFor="p-owner">
              {ownerLabel}
            </label>
            <select
              id="p-owner"
              className={input}
              value={form.landlord_id}
              onChange={(e) => onChange({ landlord_id: e.target.value })}
            >
              <option value="">Not assigned</option>
              {ownerChoices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.email ? ` · ${o.email}` : ""}
                </option>
              ))}
            </select>
            {err("landlord_id")}
            {!ownerChoices.length && (
              <span className="mt-1 block text-xs text-muted-foreground">
                No {ownerLabel.toLowerCase()}s available in your scope yet.
              </span>
            )}
          </div>

          <div>
            <label className={label} htmlFor="p-units">
              Number of units
            </label>
            <input
              id="p-units"
              type="number"
              min={0}
              className={input}
              value={form.number_of_units}
              onChange={(e) => onChange({ number_of_units: e.target.value })}
            />
            {err("number_of_units")}
          </div>

          <div>
            <label className={label} htmlFor="p-status">
              Status
            </label>
            <select
              id="p-status"
              className={input}
              value={form.status}
              onChange={(e) => onChange({ status: e.target.value as "active" | "archived" })}
            >
              <option value="active">Active</option>
              <option value="archived">Deactivated</option>
            </select>
          </div>
        </div>
      )}

      {showAddress && (
        <div className="space-y-4">
          {section === "all" && (
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Address
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Country *</span>
              <div className="mt-1">
                <CountryPicker
                  value={form.country}
                  onChange={(v) => onChange({ country: v, state: "" })}
                />
              </div>
              {err("country")}
            </div>
            <div>
              <span className={label}>County / Region *</span>
              <div className="mt-1">
                <StatePicker
                  country={form.country}
                  value={form.state}
                  onChange={(v) => onChange({ state: v })}
                />
              </div>
              {err("state")}
            </div>
            {(
              [
                ["city", "City / Town"],
                ["estate", "Estate / Area"],
                ["street", "Street"],
                ["building_number", "Building / Plot number"],
                ["postal_code", "Postal address"],
                ["address_line2", "Additional address line"],
                ["latitude", "Latitude"],
                ["longitude", "Longitude"],
              ] as [keyof PropertyFormState, string][]
            ).map(([key, text]) => (
              <div key={key}>
                <label className={label} htmlFor={`p-${key}`}>
                  {text}
                </label>
                <input
                  id={`p-${key}`}
                  className={input}
                  value={String(form[key] ?? "")}
                  onChange={(e) => onChange({ [key]: e.target.value } as Partial<PropertyFormState>)}
                />
                {err(String(key))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
