import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { ReviewList, Wizard } from "@/components/vendor/Wizard";
import {
  ResidentFormFields,
  UnitPicker,
  emptyResidentForm,
  type ResidentForm,
} from "@/components/vendor/ResidentForms";
import {
  createVendorResident,
  listVendorAssignableUnits,
} from "@/lib/vendor-residents.functions";

export const Route = createFileRoute("/_authenticated/vendor/residents/new")({
  head: () => ({
    meta: [
      { title: "Add Resident · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Onboard a new resident into the zones served by your vendor account.",
      },
      { property: "og:title", content: "Add Resident · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Create a resident account and optionally assign a unit in your vendor scope.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: AddResidentPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function AddResidentPage() {
  const access = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchUnits = useServerFn(listVendorAssignableUnits);
  const createResident = useServerFn(createVendorResident);

  const { data: unitData } = useQuery({
    queryKey: ["vendor-assignable-units"],
    queryFn: () => fetchUnits(),
  });
  const units = unitData?.units ?? [];

  const [form, setForm] = useState<ResidentForm>(emptyResidentForm);
  const [selectedUnit, setSelectedUnit] = useState("");

  const back = () => void navigate({ to: "/vendor/residents" });

  const createMutation = useMutation({
    mutationFn: () =>
      createResident({
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
          ...(selectedUnit ? { unit_id: selectedUnit } : {}),
        },
      }),
    onSuccess: async (res) => {
      toast.success("Resident created successfully");
      await queryClient.invalidateQueries({ queryKey: ["vendor-residents"] });
      await queryClient.invalidateQueries({ queryKey: ["vendor-assignable-units"] });
      await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
      navigate({ to: "/vendor/residents/$residentId", params: { residentId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardShell
      access={access}
      title="Add Resident"
      description="Create a resident account step by step"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-5 sm:p-6">
        <Wizard
          submitLabel="Create resident"
          pending={createMutation.isPending}
          onCancel={back}
          onSubmit={() => createMutation.mutate()}
          steps={[
            {
              title: "Profile",
              description: "Photo and full name of the resident.",
              validate: () =>
                !form.first_name.trim() || !form.last_name.trim()
                  ? "First and last name are required"
                  : null,
              content: <ResidentFormFields section="identity" form={form} onChange={setForm} />,
            },
            {
              title: "Contact",
              description: "How you reach the resident, plus ID and status.",
              validate: () =>
                /.+@.+\..+/.test(form.email.trim()) ? null : "A valid email address is required",
              content: <ResidentFormFields section="contact" form={form} onChange={setForm} />,
            },
            {
              title: "Unit",
              description: "Optionally assign a unit in your scope now.",
              content: <UnitPicker units={units} value={selectedUnit} onChange={setSelectedUnit} />,
            },
            {
              title: "Review",
              description: "Check the details before creating the account.",
              content: (
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
                      "Unit",
                      (() => {
                        const u = units.find((x) => x.id === selectedUnit);
                        return u ? `${u.property_name ?? ""} · ${u.unit_number}` : "Not assigned";
                      })(),
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
