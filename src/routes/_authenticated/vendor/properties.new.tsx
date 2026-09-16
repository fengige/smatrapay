import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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

  const [form, setForm] = useState<PropertyFormState>(emptyPropertyForm);
  const onChange = (patch: Partial<PropertyFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const back = () => void navigate({ to: "/vendor/properties" });

  const save = useMutation({
    mutationFn: async () => {
      const payload = propertyPayload(form);
      if (!payload.name) throw new Error("Property name is required");
      if (!payload.zone_id) throw new Error("Choose a zone you are assigned to");
      return createFn({ data: payload as never });
    },
    onSuccess: async (res: { id: string }) => {
      toast.success("Property added");
      await queryClient.invalidateQueries({ queryKey: ["vendor-properties"] });
      navigate({ to: "/vendor/properties/$propertyId", params: { propertyId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardShell
      access={access}
      title="Add Property"
      description="Register a property in your assigned zones"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-5 sm:p-6">
        <Wizard
          submitLabel="Create property"
          pending={save.isPending}
          onCancel={back}
          onSubmit={() => save.mutate()}
          steps={[
            {
              title: "Property details",
              description: "Name, type and description of the property.",
              validate: () => (form.name.trim() ? null : "Property name is required"),
              content: (
                <PropertyFormFields
                  section="details"
                  form={form}
                  onChange={onChange}
                  owners={options.data?.owners ?? []}
                  zones={options.data?.zones ?? []}
                />
              ),
            },
            {
              title: "Address",
              description: "Where the property is located.",
              content: (
                <PropertyFormFields
                  section="address"
                  form={form}
                  onChange={onChange}
                  owners={options.data?.owners ?? []}
                  zones={options.data?.zones ?? []}
                />
              ),
            },
            {
              title: "Review",
              description: "Check everything before creating the property.",
              validate: () =>
                !form.name.trim()
                  ? "Property name is required"
                  : !form.zone_id
                    ? "Choose a zone you are assigned to"
                    : null,
              content: (
                <ReviewList
                  items={[
                    ["Name", form.name],
                    ["Reference", form.code],
                    ["Type", titleCase(form.property_type)],
                    ["Owner type", titleCase(form.owner_type)],
                    [
                      "Owner",
                      options.data?.owners.find((o) => o.id === form.landlord_id)?.name ?? "",
                    ],
                    [
                      "Zone",
                      options.data?.zones.find((z) => String(z.zone_id) === form.zone_id)
                        ?.zone_name ?? "",
                    ],
                    ["Units", form.number_of_units],
                    ["Status", titleCase(form.status)],
                    [
                      "Address",
                      [form.building_number, form.street, form.estate, form.city, form.state, form.country]
                        .filter(Boolean)
                        .join(", "),
                    ],
                  ]}
                />
              ),
            },
          ]}
        />
      </div>
    </DashboardShell>
  );
}
