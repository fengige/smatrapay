import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, Building2, ClipboardCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { ReviewList, Wizard } from "@/components/vendor/Wizard";
import {
  PropertyPicker,
  ResidentFormFields,
  emptyResidentForm,
  type ResidentForm,
} from "@/components/vendor/ResidentForms";
import {
  createVendorLandlord,
  listVendorLandlordProperties,
} from "@/lib/vendor-landlords.functions";

export const Route = createFileRoute("/_authenticated/vendor/landlords/new")({
  head: () => ({
    meta: [
      { title: "Add Landlord · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Onboard a new landlord into the zones served by your vendor account.",
      },
      { property: "og:title", content: "Add Landlord · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Create a landlord account and optionally assign properties in your vendor scope.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: AddLandlordPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

function AddLandlordPage() {
  const access = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchProperties = useServerFn(listVendorLandlordProperties);
  const createLandlord = useServerFn(createVendorLandlord);

  const { data: propertyData } = useQuery({
    queryKey: ["vendor-landlord-properties"],
    queryFn: () => fetchProperties(),
  });
  const properties = propertyData?.properties ?? [];

  const [form, setForm] = useState<ResidentForm>(emptyResidentForm);
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);

  const back = () => void navigate({ to: "/vendor/landlords" });

  const createMutation = useMutation({
    mutationFn: () =>
      createLandlord({
        data: {
          first_name: form.first_name.trim(),
          middle_name: form.middle_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          id_number: form.id_number.trim(),
          address: form.address.trim(),
          status: form.status,
          ...(form.profile_image ? { profile_image: form.profile_image } : {}),
          ...(selectedProperties.length ? { property_ids: selectedProperties } : {}),
        },
      }),
    onSuccess: async (res) => {
      toast.success("Landlord created successfully");
      await queryClient.invalidateQueries({ queryKey: ["vendor-landlords"] });
      await queryClient.invalidateQueries({ queryKey: ["vendor-landlord-properties"] });
      await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
      navigate({ to: "/vendor/landlords/$landlordId", params: { landlordId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardShell
      access={access}
      title="Add Landlord"
      description="Onboard a new landlord account"
    >
      <div className="mx-auto max-w-4xl space-y-6 pb-6">
        <Wizard
          layout="timeline"
          submitLabel="Create landlord"
          pending={createMutation.isPending}
          onCancel={back}
          onSubmit={() => createMutation.mutate()}
          steps={[
            {
              title: "Personal Information",
              description: "Profile photo and full name as it appears across the portal.",
              icon: UserRound,
              validate: () =>
                !form.first_name.trim() || !form.last_name.trim()
                  ? "First and last name are required"
                  : null,
              content: (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                  <ResidentFormFields section="identity" form={form} onChange={setForm} />
                </div>
              ),
            },
            {
              title: "Contact Details",
              description: "Email, phone, ID number and account status.",
              icon: AtSign,
              validate: () =>
                /.+@.+\..+/.test(form.email.trim()) ? null : "A valid email address is required",
              content: (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                  <ResidentFormFields section="contact" form={form} onChange={setForm} />
                </div>
              ),
            },
            {
              title: "Assigned Property",
              description:
                "Optionally assign one or more properties inside your vendor scope now.",
              icon: Building2,
              content: (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                  <PropertyPicker
                    properties={properties}
                    values={selectedProperties}
                    onChange={setSelectedProperties}
                  />
                </div>
              ),
            },
            {
              title: "Review & Submit",
              description: "Check the details before creating the account.",
              icon: ClipboardCheck,
              content: (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <ReviewList
                  items={[
                    [
                      "Full name",
                      [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(" "),
                    ],
                    ["Email", form.email],
                    ["Phone", form.phone],
                    ["ID number", form.id_number],
                    ["Address", form.address],
                    ["Status", form.status === "active" ? "Active" : "Deactivated"],
                    [
                      "Properties",
                      selectedProperties.length
                        ? properties
                            .filter((p) => selectedProperties.includes(p.id))
                            .map((p) => p.name)
                            .join(", ")
                        : "Not assigned",
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
