import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, ClipboardCheck, Home, UserRound } from "lucide-react";
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
import { linkVendorApplicationResident } from "@/lib/vendor-applications.functions";
import { PREFILL_APPLICATION_KEY, PREFILL_KEY } from "./residents.apply";

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
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
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
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const linkApplication = useServerFn(linkVendorApplicationResident);

  // Details captured by the tenant application assistant, if the vendor came from there.
  useEffect(() => {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    const appId = sessionStorage.getItem(PREFILL_APPLICATION_KEY);
    sessionStorage.removeItem(PREFILL_KEY);
    sessionStorage.removeItem(PREFILL_APPLICATION_KEY);
    if (appId) setApplicationId(appId);
    if (!raw) return;
    try {
      const details = JSON.parse(raw) as Partial<ResidentForm>;
      setForm((f) => ({ ...f, ...details }));
      toast.success("Details from the application assistant loaded");
    } catch {
      /* ignore malformed prefill */
    }
  }, []);

  const back = () => void navigate({ to: "/vendor/residents" });

  const createMutation = useMutation({
    mutationFn: () =>
      createResident({
        data: {
          first_name: form.first_name.trim(),
          middle_name: form.middle_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          username: form.username?.trim(),
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
      if (applicationId) {
        try {
          await linkApplication({ data: { id: applicationId, resident_id: res.id } });
        } catch {
          /* linking the application is best-effort */
        }
      }
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
      description="Onboard a new resident account"
    >
      <div className="mx-auto max-w-4xl space-y-6 pb-6">
        <Wizard
          layout="timeline"
          submitLabel="Create resident"
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
              title: "Residency Details",
              description: "Optionally assign a unit inside your vendor scope now.",
              icon: Home,
              content: (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                  <UnitPicker units={units} value={selectedUnit} onChange={setSelectedUnit} />
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
                      "Unit",
                      (() => {
                        const u = units.find((x) => x.id === selectedUnit);
                        return u ? `${u.property_name ?? ""} · ${u.unit_number}` : "Not assigned";
                      })(),
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
