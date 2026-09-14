import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  addVendorMeter,
  listVendorSuppliers,
  listVendorUnits,
  setVendorMeterStatus,
  INSTALLATION_STATUSES,
} from "@/lib/vendor.functions";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  StatCard,
  StatusBadge,
  formatDate,
  installationLabel,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/meters/")({
  head: () => ({
    meta: [
      { title: "Meter Management · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Register, search and manage every meter assigned to your vendor account.",
      },
      { property: "og:title", content: "Meter Management · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Track meter status, installation progress and resident assignments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorMetersPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const PAGE_SIZE = 10;

function VendorMetersPage() {
  const access = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useVendorScope();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [install, setInstall] = useState("all");
  const [zone, setZone] = useState("all");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const changeStatus = useServerFn(setVendorMeterStatus);
  const statusMutation = useMutation({
    mutationFn: (v: { meter_id: string; status: "active" | "inactive" }) => changeStatus({ data: v }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
      toast.success("Meter status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meters = data?.meters ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meters.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (status !== "all" && m.status !== status) return false;
      if (install !== "all" && m.installation_status !== install) return false;
      if (zone !== "all" && String(m.zone_id ?? "") !== zone) return false;
      if (!needle) return true;
      return [m.meter_number, m.serial_number, m.resident_name, m.supplier_name, m.zone_name].some(
        (v) => (v ?? "").toLowerCase().includes(needle),
      );
    });
  }, [meters, q, type, status, install, zone]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DashboardShell
      access={access}
      title="Meter management"
      description={`Meters assigned to you: ${meters.length}`}
      actions={
        <>
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 inline size-3.5" /> Add meter
          </button>
          <button
            className="btn-outline px-3 py-1.5 text-sm"
            onClick={() => navigate({ to: "/vendor/meters/bulk-add" })}
          >
            Bulk add
          </button>
        </>
      }
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total meters" value={meters.length} />
            <StatCard label="Active" value={meters.filter((m) => m.status === "active").length} />
            <StatCard
              label="Installed"
              value={meters.filter((m) => m.installation_status === "installed").length}
            />
            <StatCard label="Assigned" value={meters.filter((m) => m.unit_id).length} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search meter, serial, resident"
                aria-label="Search meters"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              aria-label="Filter by type"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All types</option>
              <option value="electricity">Electricity</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              aria-label="Filter by installation status"
              value={install}
              onChange={(e) => {
                setInstall(e.target.value);
                setPage(1);
              }}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All installations</option>
              {INSTALLATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {installationLabel(s)}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by zone"
              value={zone}
              onChange={(e) => {
                setZone(e.target.value);
                setPage(1);
              }}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All zones</option>
              {(data?.zones ?? []).map((z) => (
                <option key={z.zone_id} value={String(z.zone_id)}>
                  {z.zone_name}
                </option>
              ))}
            </select>
          </div>

          {meters.length === 0 ? (
            <EmptyState title="No meters" message="No meters are assigned to your vendor account yet." />
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Meter</th>
                      <th className="px-3 py-2">Serial</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Zone</th>
                      <th className="px-3 py-2">Resident</th>
                      <th className="px-3 py-2">SGC</th>
                      <th className="px-3 py-2">KRN</th>
                      <th className="px-3 py-2">TI</th>
                      <th className="px-3 py-2">EA</th>
                      <th className="px-3 py-2">KEN</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Installation</th>
                      <th className="px-3 py-2">Added</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold">{m.meter_number}</td>
                        <td className="px-3 py-2">{m.serial_number}</td>
                        <td className="px-3 py-2">{titleCase(m.type)}</td>
                        <td className="px-3 py-2">{m.supplier_name ?? "—"}</td>
                        <td className="px-3 py-2">{m.zone_name ?? "—"}</td>
                        <td className="px-3 py-2">{m.resident_name ?? "—"}</td>
                        <td className="px-3 py-2">{m.sgc ?? "—"}</td>
                        <td className="px-3 py-2">{m.krn ?? "—"}</td>
                        <td className="px-3 py-2">{m.ti ?? "—"}</td>
                        <td className="px-3 py-2">{m.ea ?? "—"}</td>
                        <td className="px-3 py-2">{m.ken ?? "—"}</td>
                        <td className="px-3 py-2">
                          <StatusBadge value={m.status} />
                        </td>
                        <td className="px-3 py-2">{installationLabel(m.installation_status)}</td>
                        <td className="px-3 py-2">{formatDate(m.created_at)}</td>
                        <td className="px-3 py-2">
                          <span className="flex gap-2 whitespace-nowrap">
                            <Link
                              to="/vendor/meters/$meterId"
                              params={{ meterId: m.id }}
                              className="text-xs font-semibold text-primary"
                            >
                              View
                            </Link>
                            <button
                              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                              disabled={statusMutation.isPending}
                              onClick={() =>
                                statusMutation.mutate({
                                  meter_id: m.id,
                                  status: m.status === "active" ? "inactive" : "active",
                                })
                              }
                            >
                              {m.status === "active" ? "Deactivate" : "Activate"}
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                    {current.length === 0 && (
                      <tr>
                        <td colSpan={15} className="px-4 py-8 text-center text-muted-foreground">
                          No meters match these filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageCount={pageCount} onPage={setPage} total={rows.length} />
            </>
          )}
        </div>
      )}

      {addOpen && <AddMeterDialog onClose={() => setAddOpen(false)} />}
    </DashboardShell>
  );
}

function AddMeterDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useServerFn(addVendorMeter);
  const fetchSuppliers = useServerFn(listVendorSuppliers);
  const fetchUnits = useServerFn(listVendorUnits);
  const { data: supplierData } = useQuery({
    queryKey: ["vendor-suppliers"],
    queryFn: () => fetchSuppliers(),
  });
  const { data: unitData } = useQuery({ queryKey: ["vendor-units"], queryFn: () => fetchUnits() });

  const [form, setForm] = useState({
    meter_number: "",
    serial_number: "",
    type: "electricity",
    supplier_id: "",
    unit_id: "",
    status: "active",
    installation_status: "not_installed",
    price_per_unit: "",
    initial_reading: "",
    sgc: "",
    krn: "",
    ti: "",
    ea: "",
    ken: "",
  });
  const [fieldError, setFieldError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          meter_number: form.meter_number,
          serial_number: form.serial_number,
          type: form.type as "electricity" | "water" | "gas",
          supplier_id: form.supplier_id || null,
          unit_id: form.unit_id || null,
          status: form.status as "active" | "inactive",
          installation_status: form.installation_status as (typeof INSTALLATION_STATUSES)[number],
          price_per_unit: form.price_per_unit,
          initial_reading: form.initial_reading,
          sgc: form.sgc,
          krn: form.krn,
          ti: form.ti,
          ea: form.ea,
          ken: form.ken,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
      toast.success("Meter added");
      onClose();
    },
    onError: (e: Error) => setFieldError(e.message),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-bold text-foreground">Add meter</h2>
        <p className="text-xs text-muted-foreground">
          The meter is registered to your vendor account automatically.
        </p>
        {fieldError && (
          <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {fieldError}
          </p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Meter number *">
            <input className="input" value={form.meter_number} onChange={set("meter_number")} />
          </Field>
          <Field label="Serial number *">
            <input className="input" value={form.serial_number} onChange={set("serial_number")} />
          </Field>
          <Field label="Meter type *">
            <select className="input" value={form.type} onChange={set("type")}>
              <option value="electricity">Electricity</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
          </Field>
          <Field label="Supplier">
            <select className="input" value={form.supplier_id} onChange={set("supplier_id")}>
              <option value="">No supplier</option>
              {(supplierData?.suppliers ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.company_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assign to unit">
            <select className="input" value={form.unit_id} onChange={set("unit_id")}>
              <option value="">Not assigned</option>
              {(unitData?.units ?? [])
                .filter((u) => !u.meter_number)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.property_name ?? "Property"} · {u.unit_label}
                    {u.resident_name ? ` · ${u.resident_name}` : ""}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={set("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Installation status">
            <select
              className="input"
              value={form.installation_status}
              onChange={set("installation_status")}
            >
              {INSTALLATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {installationLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price per unit">
            <input className="input" value={form.price_per_unit} onChange={set("price_per_unit")} />
          </Field>
          <Field label="Initial reading">
            <input className="input" value={form.initial_reading} onChange={set("initial_reading")} />
          </Field>
          {(["sgc", "krn", "ti", "ea", "ken"] as const).map((k) => (
            <Field key={k} label={k.toUpperCase()}>
              <input className="input" value={form[k]} onChange={set(k)} />
            </Field>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline px-4 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary px-4 py-2 text-sm"
            disabled={mutation.isPending}
            onClick={() => {
              setFieldError(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending ? "Saving…" : "Add meter"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
