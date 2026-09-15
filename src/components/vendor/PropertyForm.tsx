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
  subtype: "apartment",
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
}: {
  form: PropertyFormState;
  onChange: (patch: Partial<PropertyFormState>) => void;
  owners: OwnerOption[];
  zones: ZoneOption[];
}) {
  const ownerChoices = owners.filter((o) => o.roles.includes(form.owner_type));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="p-name">
            Property name *
          </label>
          <input
            id="p-name"
            className={input}
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
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
          <label className={label} htmlFor="p-type">
            Type *
          </label>
          <select
            id="p-type"
            className={input}
            value={form.property_type}
            onChange={(e) => onChange({ property_type: e.target.value as "building" | "zone" })}
          >
            <option value="building">Building</option>
            <option value="zone">Zone</option>
          </select>
        </div>
        {form.property_type === "building" && (
          <>
            <div>
              <label className={label} htmlFor="p-cat">
                Category *
              </label>
              <select
                id="p-cat"
                className={input}
                value={form.building_category}
                onChange={(e) => onChange({ building_category: e.target.value })}
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="p-sub">
                Subtype *
              </label>
              <input
                id="p-sub"
                className={input}
                value={form.subtype}
                onChange={(e) => onChange({ subtype: e.target.value })}
              />
            </div>
          </>
        )}
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
            Owner
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

      <div>
        <label className={label} htmlFor="p-desc">
          Description
        </label>
        <textarea
          id="p-desc"
          className={input}
          rows={2}
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Address</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["country", "Country"],
            ["state", "County / Region"],
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
          </div>
        ))}
      </div>
    </div>
  );
}
