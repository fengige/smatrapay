import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { createProperty } from "@/lib/properties.functions";
import { PortalLayout } from "@/components/PortalLayout";
import { PropertyForm, emptyProperty, type PropertyFormValues } from "@/components/PropertyForm";

export const Route = createFileRoute("/_authenticated/properties/new")({
  head: () => ({
    meta: [
      { title: "Add Property · SmatraPay" },
      {
        name: "description",
        content: "Create a new SmatraPay property record with address and status details.",
      },
      { property: "og:title", content: "Add Property · SmatraPay" },
      {
        property: "og:description",
        content: "Register a new property in the SmatraPay portfolio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewPropertyPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{(error as Error).message}</div>
  ),
});

function clean(values: PropertyFormValues) {
  const out: Record<string, unknown> = {
    name: values.name,
    status: values.status,
    property_type: values.property_type,
    building_category: values.property_type === "building" ? values.building_category : null,
    subtype: values.property_type === "building" ? values.subtype || null : null,
    number_of_units: values.number_of_units.trim() ? Number(values.number_of_units) : null,
    owner_type: values.owner_type,
    landlord_id: values.landlord_id || null,
    zone_id: values.property_type === "zone" && values.zone_id ? Number(values.zone_id) : null,
    route_id: values.property_type === "zone" && values.route_id ? Number(values.route_id) : null,
    street_id: values.property_type === "zone" && values.street_id ? Number(values.street_id) : null,
  };
  for (const key of [
    "code",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "country",
    "postal_code",
    "description",
  ] as const) {
    out[key] = values[key].trim() || null;
  }
  return out;
}

function NewPropertyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createProperty);

  const mutation = useMutation({
    mutationFn: (values: PropertyFormValues) => create({ data: clean(values) } as never),
    onSuccess: async (res: { id: string }, variables: PropertyFormValues) => {
      toast.success("Property created", {
        description: `${variables.name} has been added successfully.`,
        duration: 5000,
      });
      await queryClient.invalidateQueries({ queryKey: ["properties"] });
      await navigate({
        to: "/properties/$id",
        params: { id: res.id },
        search: { success: "created" },
      });
    },
    onError: (err: Error) => toast.error(err.message || "Could not create property"),
  });

  return (
    <PortalLayout roles={["admin"]} title="Add Property" description="Create a new property record">
      <PropertyForm
        initial={emptyProperty}
        submitLabel="Create property"
        pending={mutation.isPending}
        onSubmit={(values) => mutation.mutate(values)}
        onCancel={() => void navigate({ to: "/properties", search: { page: 1, limit: 10 } })}
      />
    </PortalLayout>
  );
}
