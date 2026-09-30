import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Loader2,
  Pencil,
  Plus,
  PowerOff,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { SupplierDialog } from "@/components/SupplierDialog";
import { SearchSelect } from "@/components/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { extensionForType, validateProfileImage } from "@/lib/image-upload";
import {
  getSupplier,
  setSupplierLogo,
  setSupplierStatus,
  type SupplierMeterRow,
} from "@/lib/suppliers.functions";
import {
  addMeter,
  bulkMeterAction,
  listBulkMeterOptions,
  setMeterStatus,
} from "@/lib/meters.functions";

export const Route = createFileRoute("/_authenticated/meter-suppliers/$supplierId")({
  head: () => ({
    meta: [
      { title: "Meter Supplier Details · SmatraPay" },
      {
        name: "description",
        content:
          "View a meter supplier's profile and every meter they supply, with add, bulk add, activation and deletion controls.",
      },
      { property: "og:title", content: "Meter Supplier Details · SmatraPay" },
      {
        property: "og:description",
        content: "Supplier profile, contacts and the full list of meters supplied.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupplierDetailsPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

const STATUS_TONE: Record<string, string> = {
  Active: "bg-emerald-500/12 text-emerald-600",
  Inactive: "bg-muted text-muted-foreground",
  Suspended: "bg-amber-500/12 text-amber-600",
};

const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "S"
  );
}

const PAGE_SIZE = 10;

function SupplierDetailsPage() {
  const { supplierId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchSupplier = useServerFn(getSupplier);
  const changeStatus = useServerFn(setSupplierStatus);
  const saveLogo = useServerFn(setSupplierLogo);
  const changeMeterStatus = useServerFn(setMeterStatus);
  const runBulkAction = useServerFn(bulkMeterAction);

  const [tab, setTab] = useState<"info" | "meters">("info");
  const [editing, setEditing] = useState(false);
  const [showAddMeter, setShowAddMeter] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["meter-supplier", supplierId],
    queryFn: () => fetchSupplier({ data: { id: supplierId } } as never),
  });

  const supplier = data?.supplier ?? null;
  const meters: SupplierMeterRow[] = useMemo(() => supplier?.meters ?? [], [supplier]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["meter-supplier", supplierId] });
    await queryClient.invalidateQueries({ queryKey: ["meter-suppliers"] });
    await queryClient.invalidateQueries({ queryKey: ["meters"] });
  };

  const statusMutation = useMutation({
    mutationFn: async (status: "Active" | "Inactive") =>
      changeStatus({ data: { id: supplierId, status } } as never),
    onSuccess: async (_r, status) => {
      await refresh();
      toast.success(status === "Active" ? "Supplier activated" : "Supplier deactivated");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update supplier"),
  });

  const meterStatusMutation = useMutation({
    mutationFn: async (v: { id: string; status: "active" | "inactive" }) =>
      changeMeterStatus({ data: v } as never),
    onSuccess: async (_r, v) => {
      await refresh();
      toast.success(v.status === "active" ? "Meter activated" : "Meter deactivated");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update meter"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      runBulkAction({ data: { action: "delete", ids: [id] } } as never),
    onSuccess: async () => {
      await refresh();
      toast.success("Meter deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete meter"),
  });

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    const check = await validateProfileImage(file);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    setBusyPhoto(true);
    try {
      const path = `suppliers/${supplierId}/${Date.now()}.${extensionForType(file.type)}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Could not link image");
      await saveLogo({ data: { id: supplierId, logo_url: signed.signedUrl } } as never);
      await refresh();
      toast.success("Supplier photo updated");
    } catch (e) {
      toast.error((e as Error).message || "Could not upload photo");
    } finally {
      setBusyPhoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    setBusyPhoto(true);
    try {
      await saveLogo({ data: { id: supplierId, logo_url: null } } as never);
      await refresh();
      toast.success("Supplier photo removed");
    } catch (e) {
      toast.error((e as Error).message || "Could not remove photo");
    } finally {
      setBusyPhoto(false);
    }
  };

  const summary = useMemo(() => {
    const by = (t: string) => meters.filter((m) => m.type === t).length;
    return {
      total: meters.length,
      electricity: by("electricity"),
      water: by("water"),
      gas: by("gas"),
      active: meters.filter((m) => m.status === "active").length,
      inactive: meters.filter((m) => m.status !== "active").length,
    };
  }, [meters]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meters.filter((m) => {
      if (
        needle &&
        ![m.meter_number, m.serial_number, m.owner_name ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
        return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (ownerFilter !== "all" && (m.owner_type ?? "Unassigned") !== ownerFilter) return false;
      if (fromDate && m.created_at.slice(0, 10) < fromDate) return false;
      if (toDate && m.created_at.slice(0, 10) > toDate) return false;
      return true;
    });
  }, [meters, q, typeFilter, statusFilter, ownerFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const title = supplier?.company_name ?? "Supplier";

  return (
    <PortalLayout roles={["admin"]} title="Meter Supplier Details">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>Admin Portal</li>
          <li aria-hidden>/</li>
          <li>
            <Link to="/meter-suppliers" className="hover:underline">
              Meter Suppliers
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="font-medium text-foreground">{title}</li>
        </ol>
      </nav>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/meter-suppliers"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <ArrowLeft className="size-4" /> Back to Meter Suppliers
          </Link>
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          {supplier && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[supplier.status] ?? ""}`}
            >
              {supplier.status}
            </span>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="mt-10 flex justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-semibold">Supplier not found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {(error as Error)?.message || "This supplier may have been removed."}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Try again
          </button>
        </div>
      )}

      {supplier && (
        <>
          <div className="mt-5 flex gap-2 border-b border-border">
            {(
              [
                ["info", "Supplier Info"],
                ["meters", `Meters Supplied (${summary.total})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-current={tab === key}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "info" && (
            <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr]">
              <div className="rounded-2xl border border-border bg-card p-5 text-center">
                <div className="relative mx-auto w-fit">
                  {supplier.logo_url ? (
                    <img
                      src={supplier.logo_url}
                      alt={`${supplier.company_name} profile photo`}
                      className="size-28 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex size-28 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                      {initialsOf(supplier.company_name)}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busyPhoto}
                    aria-label={supplier.logo_url ? "Change supplier photo" : "Upload supplier photo"}
                    className="absolute -bottom-1 -right-1 inline-flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-accent/10 disabled:opacity-60"
                  >
                    {busyPhoto ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Camera className="size-4" />
                    )}
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => void onPickPhoto(e.target.files?.[0])}
                />
                <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busyPhoto}
                    className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
                  >
                    {supplier.logo_url ? "Change photo" : "Upload photo"}
                  </button>
                  {supplier.logo_url && (
                    <>
                      <a
                        href={supplier.logo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium hover:underline"
                      >
                        View
                      </a>
                      <button
                        type="button"
                        onClick={() => void removePhoto()}
                        disabled={busyPhoto}
                        className="text-xs font-medium text-destructive hover:underline disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">JPG, PNG or WebP · max 5MB</p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">Supplier information</h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-accent/10"
                    >
                      <Pencil className="size-3.5" /> Edit Supplier
                    </button>
                    <button
                      type="button"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate(supplier.status === "Active" ? "Inactive" : "Active")
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-accent/10 disabled:opacity-60"
                    >
                      {supplier.status === "Active" ? (
                        <>
                          <PowerOff className="size-3.5" /> Deactivate
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-3.5" /> Activate
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  {[
                    ["Company name", supplier.company_name],
                    ["Utility type", supplier.utility_type],
                    ["Licence / registration number", supplier.license_number],
                    ["Contact person", supplier.contact_name],
                    ["Email", supplier.email],
                    ["Phone", supplier.phone_number],
                    ["Website", supplier.website_url],
                    ["Status", supplier.status],
                    ["Meters supplied", String(summary.total)],
                    ["Date added", fmtDate(supplier.created_at)],
                    ["Last updated", fmtDate(supplier.updated_at)],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-sm font-medium break-words">{dash(value as string)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}


          {tab === "meters" && (
            <div className="mt-5">
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {[
                  ["Total", summary.total],
                  ["Electricity", summary.electricity],
                  ["Water", summary.water],
                  ["Gas", summary.gas],
                  ["Active", summary.active],
                  ["Inactive", summary.inactive],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-bold">{value as number}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold">Meters Supplied: {summary.total}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddMeter(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="size-4" /> Add Meter
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: "/meters/bulk-add",
                        search: {
                          supplier: supplierId,
                          from: `/meter-suppliers/${supplierId}`,
                        },
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
                  >
                    <Layers className="size-4" /> Bulk Add Meters
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div className="relative md:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search meter number, serial or assigned user"
                    aria-label="Search meters"
                    className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter by type"
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="all">All types</option>
                  <option value="electricity">Electricity</option>
                  <option value="water">Water</option>
                  <option value="gas">Gas</option>
                </select>
                <select
                  value={ownerFilter}
                  onChange={(e) => {
                    setOwnerFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter by user type"
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="all">All user types</option>
                  <option value="Vendor">Vendor</option>
                  <option value="Landlord">Landlord</option>
                  <option value="Agent">Agent</option>
                  <option value="Unassigned">Unassigned</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter by status"
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setPage(1);
                    }}
                    aria-label="Added from"
                    className="h-11 w-full rounded-xl border border-border bg-background px-2 text-xs"
                  />
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setPage(1);
                    }}
                    aria-label="Added to"
                    className="h-11 w-full rounded-xl border border-border bg-background px-2 text-xs"
                  />
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Meter number</th>
                      <th className="px-4 py-3">Serial</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">User type</th>
                      <th className="px-4 py-3">Assigned user</th>
                      <th className="px-4 py-3">SGC</th>
                      <th className="px-4 py-3">KRN</th>
                      <th className="px-4 py-3">TI</th>
                      <th className="px-4 py-3">EA</th>
                      <th className="px-4 py-3">KEN</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Date added</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {!pageRows.length && (
                      <tr>
                        <td colSpan={14} className="px-4 py-10 text-center text-muted-foreground">
                          {meters.length
                            ? "No meters match your search or filters."
                            : "No meters recorded for this supplier yet."}
                        </td>
                      </tr>
                    )}
                    {pageRows.map((m) => (
                      <tr key={m.id} className="hover:bg-accent/5">
                        <td className="px-4 py-3 font-medium">{dash(m.meter_number)}</td>
                        <td className="px-4 py-3">{dash(m.serial_number)}</td>
                        <td className="px-4 py-3 capitalize">{dash(m.type)}</td>
                        <td className="px-4 py-3">{supplier.company_name}</td>
                        <td className="px-4 py-3">{dash(m.owner_type)}</td>
                        <td className="px-4 py-3">{dash(m.owner_name)}</td>
                        <td className="px-4 py-3">{dash(m.sgc)}</td>
                        <td className="px-4 py-3">{dash(m.krn)}</td>
                        <td className="px-4 py-3">{dash(m.ti)}</td>
                        <td className="px-4 py-3">{dash(m.ea)}</td>
                        <td className="px-4 py-3">{dash(m.ken)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              m.status === "active"
                                ? "bg-emerald-500/12 text-emerald-600"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{fmtDate(m.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Link
                              to="/meters/$meterId"
                              params={{ meterId: m.id }}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                            >
                              <Eye className="size-3.5" /> View
                            </Link>
                            <button
                              type="button"
                              disabled={meterStatusMutation.isPending}
                              onClick={() =>
                                meterStatusMutation.mutate({
                                  id: m.id,
                                  status: m.status === "active" ? "inactive" : "active",
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10 disabled:opacity-60"
                            >
                              {m.status === "active" ? (
                                <>
                                  <PowerOff className="size-3.5" /> Deactivate
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="size-3.5" /> Activate
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete meter ${m.meter_number}? This cannot be undone.`,
                                  )
                                )
                                  deleteMutation.mutate(m.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                            >
                              <Trash2 className="size-3.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <p className="text-muted-foreground">
                  Showing {pageRows.length} of {filtered.length} filtered · {summary.total} total
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={current <= 1}
                    onClick={() => setPage(current - 1)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    <ChevronLeft className="size-3.5" /> Previous
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Page {current} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={current >= totalPages}
                    onClick={() => setPage(current + 1)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    Next <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {editing && supplier && (
        <SupplierDialog
          supplier={supplier}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await refresh();
            toast.success("Supplier updated");
          }}
        />
      )}

      {showAddMeter && supplier && (
        <AddMeterDialog
          supplierId={supplierId}
          supplierName={supplier.company_name}
          onClose={() => setShowAddMeter(false)}
          onSaved={async () => {
            setShowAddMeter(false);
            await refresh();
            toast.success("Meter added");
          }}
        />
      )}
    </PortalLayout>
  );
}

function AddMeterDialog({
  supplierId,
  supplierName,
  onClose,
  onSaved,
}: {
  supplierId: string;
  supplierName: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const loadOptions = useServerFn(listBulkMeterOptions);
  const create = useServerFn(addMeter);

  const { data } = useQuery({
    queryKey: ["bulk-meter-options"],
    queryFn: () => loadOptions({} as never),
  });

  const [ownerType, setOwnerType] = useState<"vendor" | "landlord" | "agent">("landlord");
  const [ownerId, setOwnerId] = useState("");
  const [meterType, setMeterType] = useState<"electricity" | "water" | "gas">("electricity");
  const [meterNumber, setMeterNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [sts, setSts] = useState({ sgc: "", krn: "", ti: "", ea: "", ken: "" });
  const [submitted, setSubmitted] = useState(false);

  const owners =
    ownerType === "vendor"
      ? (data?.vendors ?? [])
      : ownerType === "agent"
        ? (data?.agents ?? [])
        : (data?.landlords ?? []);

  const idRe = /^[A-Za-z0-9_-]{4,64}$/;
  const numberError = !meterNumber.trim()
    ? "Meter number is required"
    : idRe.test(meterNumber.trim())
      ? null
      : "Use 4–64 letters, numbers, hyphen or underscore";
  const serialError =
    serialNumber.trim() && !idRe.test(serialNumber.trim())
      ? "Use 4–64 letters, numbers, hyphen or underscore"
      : null;
  const ownerError = ownerId ? null : "Select the user this meter belongs to";
  const hasErrors = Boolean(numberError || serialError || ownerError);

  const mutation = useMutation({
    mutationFn: async () => {
      const intOrNull = (v: string) => (v.trim() ? v.trim() : null);
      await create({
        data: {
          vendor_id: ownerId,
          supplier_id: supplierId,
          landlord_id: ownerType === "landlord" ? ownerId : null,
          agent_id: ownerType === "agent" ? ownerId : null,
          unit_id: null,
          meter_number: meterNumber.trim(),
          serial_number: serialNumber.trim(),
          type: meterType,
          initial_reading: "0",
          price_per_unit: "0",
          status: "active",
          sgc: intOrNull(sts.sgc),
          krn: intOrNull(sts.krn),
          ti: intOrNull(sts.ti),
          ea: intOrNull(sts.ea),
          ken: intOrNull(sts.ken),
        },
      } as never);
    },
    onSuccess: () => onSaved(),
    onError: (e: Error) => toast.error(e.message || "Could not add meter"),
  });

  const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
  const err = (msg: string | null) =>
    submitted && msg ? <p className="mt-1 text-xs text-destructive">{msg}</p> : null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-meter-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-lg">
        <h2 id="add-meter-title" className="text-lg font-bold">
          Add Meter
        </h2>
        <p className="text-sm text-muted-foreground">
          The supplier is locked to this page and saved with the meter.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Supplier</span>
            <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 text-sm">
              <span className="truncate font-medium">{supplierName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">Locked</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="am-type">
              Meter type
            </label>
            <select
              id="am-type"
              value={meterType}
              onChange={(e) => setMeterType(e.target.value as typeof meterType)}
              className={field}
            >
              <option value="electricity">Electricity</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="am-owner-type">
              User type
            </label>
            <select
              id="am-owner-type"
              value={ownerType}
              onChange={(e) => {
                setOwnerType(e.target.value as typeof ownerType);
                setOwnerId("");
              }}
              className={field}
            >
              <option value="landlord">Landlord</option>
              <option value="agent">Agent</option>
              <option value="vendor">Vendor</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Assigned user</span>
            <SearchSelect
              id="am-owner"
              value={ownerId}
              onChange={setOwnerId}
              invalid={submitted && Boolean(ownerError)}
              placeholder="Search and select a user"
              emptyLabel="No users match your search"
              options={owners.map((o) => ({ id: o.id, label: o.name }))}
            />
            {err(ownerError)}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="am-number">
              Meter number
            </label>
            <input
              id="am-number"
              value={meterNumber}
              onChange={(e) => setMeterNumber(e.target.value)}
              className={field}
            />
            {err(numberError)}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="am-serial">
              Serial number <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="am-serial"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className={field}
            />
            {err(serialError)}
          </div>

          {(["sgc", "krn", "ti", "ea", "ken"] as const).map((k) => (
            <div key={k}>
              <label className="mb-1 block text-sm font-medium" htmlFor={`am-${k}`}>
                {k.toUpperCase()} <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                id={`am-${k}`}
                inputMode="numeric"
                value={sts[k]}
                onChange={(e) => setSts((p) => ({ ...p, [k]: e.target.value }))}
                className={field}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setSubmitted(true);
              if (hasErrors) {
                toast.error("Complete the required fields");
                return;
              }
              mutation.mutate();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Add meter
          </button>
        </div>
      </div>
    </div>
  );
}
