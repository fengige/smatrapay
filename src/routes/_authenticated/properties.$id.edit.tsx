import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getProperty, updateProperty } from "@/lib/properties.functions";
import { PortalLayout } from "@/components/PortalLayout";
import { PropertyForm, type PropertyFormValues } from "@/components/PropertyForm";

export const Route = createFileRoute("/_authenticated/properties/$id/edit")({
  head: () => ({
    meta: [
      { title: "Edit Property · SmatraPay" },
      {
        name: "description",
        content: "Update a SmatraPay property record, its address details and status.",
      },
      { property: "og:title", content: "Edit Property · SmatraPay" },
      {
        property: "og:description",
        content: "Edit property address, code, description and status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditPropertyPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm">Property not found.</div>,
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

function EditPropertyPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProperty = useServerFn(getProperty);
  const save = useServerFn(updateProperty);

  const { data, isLoading, error } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty({ data: { id } }),
  });

  const mutation = useMutation({
    mutationFn: (values: PropertyFormValues) => save({ data: { id, ...clean(values) } } as never),
    onSuccess: async (_data: unknown, variables: PropertyFormValues) => {
      toast.success("Property updated", {
        description: `${variables.name} has been saved successfully.`,
        duration: 5000,
      });
      await queryClient.invalidateQueries({ queryKey: ["properties"] });
      await navigate({
        to: "/properties/$id",
        params: { id },
        search: { success: "updated" },
      });
    },
    onError: (err: Error) => toast.error(err.message || "Could not update property"),
  });

  const property = data?.property as Record<string, string | null> | undefined;

  return (
    <PortalLayout
      roles={["admin"]}
      title="Edit Property"
      description="Update property and address details"
    >
      {isLoading && (
        <div className="p-10 text-center text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </div>
      )}
      {error && <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>}
      {property && (
        <PropertyForm
          initial={{
            property_type: (property["property_type"] as "building" | "zone") ?? "building",
            building_category:
              (property["building_category"] as "residential" | "commercial" | null) ?? "residential",
            subtype: property["subtype"] ?? "",
            name: property["name"] ?? "",
            code: property["code"] ?? "",
            address_line1: property["address_line1"] ?? "",
            address_line2: property["address_line2"] ?? "",
            city: property["city"] ?? "",
            state: property["state"] ?? "",
            country: property["country"] ?? "",
            postal_code: property["postal_code"] ?? "",
            description: property["description"] ?? "",
            status: (property["status"] as "active" | "archived") ?? "active",
            number_of_units:
              property["number_of_units"] === null || property["number_of_units"] === undefined
                ? ""
                : String(property["number_of_units"]),
            owner_type:
              (property["owner_type"] as "landlord" | "agent" | "vendor") ?? "landlord",
            landlord_id: property["landlord_id"] ?? "",
            zone_id: property["zone_id"] ? String(property["zone_id"]) : "",
            route_id: property["route_id"] ? String(property["route_id"]) : "",
            street_id: property["street_id"] ? String(property["street_id"]) : "",
          }}
          submitLabel="Save changes"
          pending={mutation.isPending}
          onSubmit={(values) => mutation.mutate(values)}
          onCancel={() => void navigate({ to: "/properties/$id", params: { id } })}
        />
      )}
    </PortalLayout>
  );
}
