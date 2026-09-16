import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ClipboardCheck, MapPin, UserRound } from "lucide-react";
import { toast } from "sonner";

import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { ReviewList, Wizard } from "@/components/vendor/Wizard";
import {
  createVendorProperty,
  listVendorPropertyOptions,
} from "@/lib/vendor-properties.functions";
import {
  emptyPropertyForm,
  PropertyFormFields,
  propertyPayload,
  type PropertyFormState,
} from "@/components/vendor/PropertyForm";
import { STATE_MAP } from "@/lib/countries";
import { titleCase } from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/properties/new")({
  head: () => ({
    meta: [
      { title: "Add Property · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Register a new property inside one of your assigned zones.",
      },
      { property: "og:title", content: "Add Property · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Create a property, link an owner and set its address step by step.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: AddPropertyPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function AddPropertyPage() {
  const access = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchOptions = useServerFn(listVendorPropertyOptions);
  const createFn = useServerFn(createVendorProperty);

  const options = useQuery({
    queryKey: ["vendor-property-options"],
    queryFn: () => fetchOptions(),
  });
  const owners = options.data?.owners ?? [];
  const zones = options.data?.zones ?? [];

  const [form, setForm] = useState<PropertyFormState>(emptyPropertyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const onChange = (patch: Partial<PropertyFormState>) => {
    setErrors({});
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const back = () => void navigate({ to: "/vendor/properties" });

  const ownerLabel =
    form.owner_type === "agent" ? "agent" : form.owner_type === "vendor" ? "vendor" : "landlord";

  /** Same rules as the admin add-property wizard, plus the vendor zone requirement. */
  const validateDetails = () => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next["name"] = "Property name must be at least 2 characters";
    if (!form.zone_id) next["zone_id"] = "Select one of your assigned zones";
    if (form.property_type === "building" && !form.subtype)
      next["subtype"] =
        form.building_category === "commercial"
          ? "Select a commercial type"
          : "Select a residential type";
    return next;
  };

  const validateOwner = () => {
    const next: Record<string, string> = {};
    const units = form.number_of_units.trim();
    if (units) {
      if (!/^\d+$/.test(units)) next["number_of_units"] = "Number of units must be a whole number";
      else if (Number(units) > 100000) next["number_of_units"] = "Number of units is too large";
    }
    if (Number(units || 0) > 0 && !form.landlord_id)
      next["landlord_id"] = `A ${ownerLabel} is required when units are greater than 0`;
    return next;
  };

  const validateAddress = () => {
    const next: Record<string, string> = {};
    if (!form.country.trim()) next["country"] = "Country is required";
    if (!form.state.trim()) next["state"] = "State / County is required";
    else {
      const states = form.country ? STATE_MAP[form.country] : undefined;
      if (states && !states.includes(form.state))
        next["state"] = `Select a valid state/county for ${form.country}`;
    }
    if (form.postal_code.trim().length > 30) next["postal_code"] = "Postal code is too long";
    return next;
  };

  const check = (fn: () => Record<string, string>) => {
    const next = fn();
    setErrors(next);
    const first = Object.values(next)[0];
    return first ?? null;
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = propertyPayload(form);
      return createFn({ data: payload as never });
    },
    onSuccess: async (res: { id: string }) => {
      toast.success("Property created", {
        description: `${form.name.trim()} has been added successfully.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["vendor-properties"] });
      await navigate({ to: "/vendor/properties/$propertyId", params: { propertyId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message || "Could not create property"),
  });

  const ownerName = owners.find((o) => o.id === form.landlord_id)?.name ?? "";
  const zoneName = zones.find((z) => String(z.zone_id) === form.zone_id)?.zone_name ?? "";

  return (
    <DashboardShell
      access={access}
      title="Add Property"
      description="Create a new property record in your assigned zones"
    >
      <div className="mx-auto max-w-4xl space-y-6 pb-6">
        <Wizard
          layout="timeline"
          submitLabel="Create property"
          pending={save.isPending}
          onCancel={back}
          onSubmit={() => {
            const all = { ...validateDetails(), ...validateOwner(), ...validateAddress() };
            setErrors(all);
            const first = Object.values(all)[0];
            if (first) {
              toast.error(first);
              return;
            }
            save.mutate();
          }}
          steps={[
            {
              title: "Property Details",
              description: "Choose the property type and its core details.",
              icon: Building2,
              validate: () => check(validateDetails),
              content: (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                  <PropertyFormFields
                    section="details"
                    form={form}
                    onChange={onChange}
                    owners={owners}
                    zones={zones}
                    errors={errors}
                  />
                </div>
              ),
            },
            {
              title: "Owner Details",
              description: "Link the owner and set how many units the property has.",
              icon: UserRound,
              validate: () => check(validateOwner),
              content: (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                  <PropertyFormFields
                    section="owner"
                    form={form}
                    onChange={onChange}
                    owners={owners}
                    zones={zones}
                    errors={errors}
                  />
                </div>
              ),
            },
            {
              title: "Address",
              description: "Where the property is located.",
              icon: MapPin,
              validate: () => check(validateAddress),
              content: (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                  <PropertyFormFields
                    section="address"
                    form={form}
                    onChange={onChange}
                    owners={owners}
                    zones={zones}
                    errors={errors}
                  />
                </div>
              ),
            },
            {
              title: "Review & Submit",
              description: "Check everything before creating the property.",
              icon: ClipboardCheck,
              content: (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                  <ReviewList
                    items={[
                      ["Name", form.name],
                      ["Reference", form.code],
                      ["Type", titleCase(form.property_type)],
                      [
                        "Category",
                        form.property_type === "building"
                          ? `${titleCase(form.building_category)}${form.subtype ? ` · ${form.subtype}` : ""}`
                          : "—",
                      ],
                      ["Zone", zoneName],
                      ["Owner type", titleCase(form.owner_type)],
                      ["Owner", ownerName],
                      ["Units", form.number_of_units],
                      ["Status", form.status === "active" ? "Active" : "Deactivated"],
                      ["Description", form.description],
                      [
                        "Address",
                        [
                          form.building_number,
                          form.street,
                          form.estate,
                          form.city,
                          form.state,
                          form.country,
                          form.postal_code,
                        ]
                          .filter(Boolean)
                          .join(", "),
                      ],
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>
    </DashboardShell>
  );
}
