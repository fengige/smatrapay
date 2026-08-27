import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Droplets,
  Flame,
  Home,
  Layers,
  Loader2,
  Pencil,
  X,
  Zap,
} from "lucide-react";
import { getUnit, updateUnitDetails } from "@/lib/properties.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/units/$unitId")({
  head: () => ({
    meta: [
      { title: "Unit Details · SmatraPay" },
      {
        name: "description",
        content: "View unit details, meter numbers and occupant assignments.",
      },
      { property: "og:title", content: "Unit Details · SmatraPay" },
      {
        property: "og:description",
        content: "View unit details, meter numbers and occupant assignments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnitDetailPage,
});

type Unit = {
  id: string;
  unit_number: string;
  building: string | null;
  unit_type: string | null;
  bedrooms: number | null;
  floor: string | null;
  status: string;
  electricity_meter_no: string | null;
  water_meter_no: string | null;
  gas_meter_no: string | null;
  notes?: string | null;
};

type EditForm = {
  unit_number: string;
  building: string;
  unit_type: string;
  bedrooms: string;
  floor: string;
  status: string;
  electricity_meter_no: string;
  water_meter_no: string;
  gas_meter_no: string;
  notes: string;
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

type Assignment = {
  id: string;
  user_id: string;
  role: string;
  start_date: string;
  end_date: string | null;
};

type Person = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

function UnitDetailPage() {
  const { unitId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchUnit = useServerFn(getUnit);
  const saveUnit = useServerFn(updateUnitDetails);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data, isLoading, error } = useQuery({
    queryKey: ["units", unitId],
    queryFn: () => fetchUnit({ data: { unitId } }),
    retry: (count, err) =>
      !/not found/i.test((err as Error)?.message ?? "") && count < 2,
  });

  const unit = data?.unit as Unit | null | undefined;
  const property = data?.property as { id: string; name: string } | null | undefined;
  const assignments = (data?.assignments ?? []) as Assignment[];
  const people = (data?.people ?? []) as Person[];
  const personById = new Map(people.map((p) => [p.id, p]));

  useEffect(() => {
    setEdit(null);
    setErrors({});
  }, [unitId]);

  const openEdit = () => {
    if (!unit) return;
    setErrors({});
    setEdit({
      unit_number: unit.unit_number ?? "",
      building: unit.building ?? "",
      unit_type: unit.unit_type ?? "",
      bedrooms: unit.bedrooms == null ? "" : String(unit.bedrooms),
      floor: unit.floor ?? "",
      status: unit.status ?? "vacant",
      electricity_meter_no: unit.electricity_meter_no ?? "",
      water_meter_no: unit.water_meter_no ?? "",
      gas_meter_no: unit.gas_meter_no ?? "",
      notes: unit.notes ?? "",
    });
  };

  const save = useMutation({
    mutationFn: (form: EditForm) =>
      saveUnit({
        data: {
          id: unitId,
          unit_number: form.unit_number.trim(),
          building: form.building.trim() || null,
          unit_type: form.unit_type.trim() || null,
          bedrooms: form.bedrooms.trim() === "" ? null : Number(form.bedrooms),
          floor: form.floor.trim() || null,
          status: form.status,
          electricity_meter_no: form.electricity_meter_no.trim() || null,
          water_meter_no: form.water_meter_no.trim() || null,
          gas_meter_no: form.gas_meter_no.trim() || null,
          notes: form.notes.trim() || null,
        },
      } as never),
    onSuccess: async () => {
      toast.success("Unit updated");
      setEdit(null);
      await queryClient.invalidateQueries({ queryKey: ["units", unitId] });
      await queryClient.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not update unit"),
  });

  const submitEdit = (form: EditForm) => {
    const next: Record<string, string> = {};
    if (!form.unit_number.trim()) next["unit_number"] = "Unit number is required";
    if (form.unit_number.trim().length > 40) next["unit_number"] = "Max 40 characters";
    if (form.bedrooms.trim() !== "") {
      const n = Number(form.bedrooms);
      if (!Number.isInteger(n) || n < 0 || n > 50) next["bedrooms"] = "Bedrooms must be 0–50";
    }
    for (const key of ["electricity_meter_no", "water_meter_no", "gas_meter_no"] as const) {
      if (form[key].trim().length > 60) next[key] = "Max 60 characters";
    }
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    save.mutate(form);
  };

  return (
    <PortalLayout
      roles={["admin"]}
      title={unit ? `Unit ${unit.unit_number}` : "Unit"}
      description="Unit details, meter numbers and assignments"
      actions={
        <div className="flex flex-wrap items-center gap-2">
        {unit && (
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Pencil className="size-4" /> Edit unit
          </button>
        )}
        <Link
          to="/properties/$id"
          params={{ id: property?.id ?? "" }}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
        >
          <ArrowLeft className="size-4" /> Back to property
        </Link>
        </div>
      }
    >
      {isLoading ? (
        <div className="p-10 text-center text-muted-foreground">Loading unit…</div>
      ) : error ? (
        <div className="p-10 text-sm text-destructive">{(error as Error).message}</div>
      ) : !unit ? (
        <div className="p-10 text-center text-muted-foreground">Unit not found.</div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Home className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-foreground">
                  Unit {unit.unit_number}
                  {unit.building && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      · {unit.building}
                    </span>
                  )}
                </h2>
                {property && (
                  <p className="text-xs text-muted-foreground">
                    Property:{" "}
                    <Link
                      to="/properties/$id"
                      params={{ id: property.id }}
                      className="text-primary hover:underline"
                    >
                      {property.name}
                    </Link>
                  </p>
                )}
              </div>
              <Pill value={unit.status} />
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Type" value={unit.unit_type || "—"} icon={Layers} />
              <StatCard label="Bedrooms" value={unit.bedrooms ?? "—"} icon={Layers} />
              <StatCard label="Floor" value={unit.floor || "—"} icon={Layers} />
              <StatCard label="Status" value={unit.status} icon={Layers} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Electricity meter"
                value={unit.electricity_meter_no || "Not set"}
                icon={Zap}
              />
              <StatCard
                label="Water meter"
                value={unit.water_meter_no || "Not set"}
                icon={Droplets}
              />
              <StatCard label="Gas meter" value={unit.gas_meter_no || "Not set"} icon={Flame} />
            </div>
            {unit.notes && (
              <p className="mt-4 rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
                {unit.notes}
              </p>
            )}
            {property && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="size-4" />
                Belongs to{" "}
                <Link
                  to="/properties/$id"
                  params={{ id: property.id }}
                  className="font-semibold text-primary hover:underline"
                >
                  {property.name}
                </Link>
              </div>
            )}
          </div>

          <section className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-4">
              <h3 className="text-sm font-bold text-foreground">Assignments</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Start</th>
                    <th className="px-4 py-3 font-semibold">End</th>
                  </tr>
                </thead>
                <tbody>
                  {!assignments.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        No assignments for this unit.
                      </td>
                    </tr>
                  )}
                  {assignments.map((a) => {
                    const person = personById.get(a.user_id);
                    return (
                      <tr key={a.id} className="border-t border-border">
                        <td className="px-4 py-3 capitalize text-foreground">{a.role}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {person?.name || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {person?.email || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {person?.phone || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{fmt(a.start_date)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {a.end_date ? fmt(a.end_date) : "Current"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <div className="mt-10 w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Edit unit</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => !save.isPending && setEdit(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/10"
              >
                <X className="size-4" />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submitEdit(edit);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Unit number" error={errors["unit_number"]}>
                  <input
                    className={inputClass}
                    value={edit.unit_number}
                    onChange={(e) => setEdit({ ...edit, unit_number: e.target.value })}
                  />
                </Field>
                <Field label="Building">
                  <input
                    className={inputClass}
                    value={edit.building}
                    onChange={(e) => setEdit({ ...edit, building: e.target.value })}
                  />
                </Field>
                <Field label="Unit type">
                  <input
                    className={inputClass}
                    placeholder="e.g. 2 Bedroom"
                    value={edit.unit_type}
                    onChange={(e) => setEdit({ ...edit, unit_type: e.target.value })}
                  />
                </Field>
                <Field label="Bedrooms" error={errors["bedrooms"]}>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className={inputClass}
                    value={edit.bedrooms}
                    onChange={(e) => setEdit({ ...edit, bedrooms: e.target.value })}
                  />
                </Field>
                <Field label="Floor">
                  <input
                    className={inputClass}
                    value={edit.floor}
                    onChange={(e) => setEdit({ ...edit, floor: e.target.value })}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className={inputClass}
                    value={edit.status}
                    onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                  >
                    <option value="vacant">Vacant</option>
                    <option value="occupied">Occupied</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="archived">Archived</option>
                  </select>
                </Field>
                <Field label="Electricity meter no." error={errors["electricity_meter_no"]}>
                  <input
                    className={inputClass}
                    value={edit.electricity_meter_no}
                    onChange={(e) => setEdit({ ...edit, electricity_meter_no: e.target.value })}
                  />
                </Field>
                <Field label="Water meter no." error={errors["water_meter_no"]}>
                  <input
                    className={inputClass}
                    value={edit.water_meter_no}
                    onChange={(e) => setEdit({ ...edit, water_meter_no: e.target.value })}
                  />
                </Field>
                <Field label="Gas meter no." error={errors["gas_meter_no"]}>
                  <input
                    className={inputClass}
                    value={edit.gas_meter_no}
                    onChange={(e) => setEdit({ ...edit, gas_meter_no: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  rows={3}
                  className={inputClass}
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEdit(null)}
                  disabled={save.isPending}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={save.isPending}
                  aria-busy={save.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {save.isPending && <Loader2 className="size-4 animate-spin" />} Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}

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
    <div>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function Pill({ value }: { value: string }) {
  const tone: Record<string, string> = {
    active: "bg-emerald-500/12 text-emerald-600",
    occupied: "bg-emerald-500/12 text-emerald-600",
    vacant: "bg-sky-500/12 text-sky-600",
    maintenance: "bg-amber-500/15 text-amber-600",
    pending: "bg-amber-500/15 text-amber-600",
    archived: "bg-muted text-muted-foreground",
    inactive: "bg-muted text-muted-foreground",
    suspended: "bg-destructive/12 text-destructive",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        tone[value] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {value}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: any;
  icon: any;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-1.5 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}
