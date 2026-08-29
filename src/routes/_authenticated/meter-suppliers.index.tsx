import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  PowerOff,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import {
  addSupplier,
  listSuppliers,
  setSupplierStatus,
  updateSupplier,
  type SupplierRow,
} from "@/lib/suppliers.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/meter-suppliers/")({
  head: () => ({
    meta: [
      { title: "Meter Suppliers · SmatraPay" },
      {
        name: "description",
        content:
          "Manage utility meter suppliers: company details, licences, contacts and whether they are selectable for new meters.",
      },
      { property: "og:title", content: "Meter Suppliers · SmatraPay" },
      {
        property: "og:description",
        content: "Add, edit and deactivate the electricity, water and gas suppliers you work with.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuppliersPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

const STATUS_TONE: Record<string, string> = {
  Active: "bg-emerald-500/12 text-emerald-600",
  Inactive: "bg-muted text-muted-foreground",
  Suspended: "bg-amber-500/12 text-amber-600",
};

function SuppliersPage() {
  const queryClient = useQueryClient();
  const fetchSuppliers = useServerFn(listSuppliers);
  const changeStatus = useServerFn(setSupplierStatus);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [utilityFilter, setUtilityFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["meter-suppliers"],
    queryFn: () => fetchSuppliers(),
  });

  const suppliers = data?.suppliers ?? [];

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: "Active" | "Inactive" }) =>
      changeStatus({ data: vars } as never),
    onSuccess: async (_r, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["meter-suppliers"] });
      await queryClient.invalidateQueries({ queryKey: ["meters"] });
      toast.success(vars.status === "Active" ? "Supplier activated" : "Supplier deactivated");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update supplier"),
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (utilityFilter !== "all" && s.utility_type !== utilityFilter) return false;
      if (!needle) return true;
      return [s.company_name, s.license_number ?? "", s.contact_name ?? "", s.email ?? "", s.phone_number ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [suppliers, q, statusFilter, utilityFilter]);

  const activeCount = suppliers.filter((s) => s.status === "Active").length;

  return (
    <PortalLayout
      roles={["admin"]}
      title="Meter Suppliers"
      description="Utility suppliers available when registering meters"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Supplier
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh suppliers"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total suppliers</span>
            <Building2 className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold">{suppliers.length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Active (selectable)</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">{activeCount}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Not selectable</span>
            <PowerOff className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold">{suppliers.length - activeCount}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company, licence, contact or email"
            aria-label="Search suppliers"
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={utilityFilter}
          onChange={(e) => setUtilityFilter(e.target.value)}
          aria-label="Filter by utility type"
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="all">All utilities</option>
          <option value="Electricity">Electricity</option>
          <option value="Water">Water</option>
          <option value="Gas">Gas</option>
          <option value="Multi-Utility">Multi-Utility</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Suspended">Suspended</option>
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-left">Utility</th>
              <th className="px-4 py-3 text-left">Licence</th>
              <th className="px-4 py-3 text-left">Contact</th>
              <th className="px-4 py-3 text-left">Meters</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && !rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No suppliers match your filters. Use “Add Supplier” to create one.
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-border/70">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{s.company_name}</div>
                  {s.website_url && (
                    <a
                      href={s.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      {s.website_url}
                    </a>
                  )}
                </td>
                <td className="px-4 py-3">{s.utility_type}</td>
                <td className="px-4 py-3">{s.license_number ?? "—"}</td>
                <td className="px-4 py-3">
                  <div>{s.contact_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {[s.email, s.phone_number].filter(Boolean).join(" · ") || "—"}
                  </div>
                </td>
                <td className="px-4 py-3">{s.meter_count}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[s.status] ?? ""}`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                    >
                      <Pencil className="size-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({
                          id: s.id,
                          status: s.status === "Active" ? "Inactive" : "Active",
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10 disabled:opacity-60"
                    >
                      {s.status === "Active" ? (
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Only suppliers with the Active status appear in the meter create, edit and bulk-add dialogs.
      </p>

      {(showAdd || editing) && (
        <SupplierDialog
          supplier={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={async () => {
            const wasEdit = Boolean(editing);
            setShowAdd(false);
            setEditing(null);
            await queryClient.invalidateQueries({ queryKey: ["meter-suppliers"] });
            await queryClient.invalidateQueries({ queryKey: ["meters"] });
            toast.success(wasEdit ? "Supplier updated" : "Supplier added");
          }}
        />
      )}
    </PortalLayout>
  );
}

function SupplierDialog({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: SupplierRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const isEdit = Boolean(supplier);
  const create = useServerFn(addSupplier);
  const edit = useServerFn(updateSupplier);

  const [form, setForm] = useState({
    company_name: supplier?.company_name ?? "",
    license_number: supplier?.license_number ?? "",
    utility_type: supplier?.utility_type ?? "Electricity",
    contact_name: supplier?.contact_name ?? "",
    email: supplier?.email ?? "",
    phone_number: supplier?.phone_number ?? "",
    website_url: supplier?.website_url ?? "",
    status: supplier?.status ?? "Active",
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const nameError = form.company_name.trim().length < 2 ? "Company name is required" : null;
  const emailError =
    form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())
      ? "Enter a valid email address"
      : null;
  const hasErrors = Boolean(nameError || emailError);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company_name: form.company_name.trim(),
        license_number: form.license_number.trim() || null,
        utility_type: form.utility_type,
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim() || null,
        phone_number: form.phone_number.trim() || null,
        website_url: form.website_url.trim() || null,
        status: form.status,
      };
      if (isEdit && supplier) await edit({ data: { ...payload, id: supplier.id } } as never);
      else await create({ data: payload } as never);
    },
    onSuccess: () => onSaved(),
    onError: (e: Error) => toast.error(e.message || "Could not save supplier"),
  });

  const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-dialog-title"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-lg">
        <h2 id="supplier-dialog-title" className="text-lg font-bold">
          {isEdit ? "Edit Supplier" : "Add Supplier"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Suppliers marked Active can be selected when registering meters.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium" htmlFor="sup-name">
              Company name
            </label>
            <input
              id="sup-name"
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
              aria-invalid={Boolean(nameError)}
              className={field}
            />
            {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="sup-utility">
              Utility type
            </label>
            <select
              id="sup-utility"
              value={form.utility_type}
              onChange={(e) => set("utility_type", e.target.value)}
              className={field}
            >
              <option value="Electricity">Electricity</option>
              <option value="Water">Water</option>
              <option value="Gas">Gas</option>
              <option value="Multi-Utility">Multi-Utility</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="sup-licence">
              Licence number <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="sup-licence"
              value={form.license_number}
              onChange={(e) => set("license_number", e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="sup-contact">
              Contact name
            </label>
            <input
              id="sup-contact"
              value={form.contact_name}
              onChange={(e) => set("contact_name", e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="sup-email">
              Email
            </label>
            <input
              id="sup-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              aria-invalid={Boolean(emailError)}
              className={field}
            />
            {emailError && <p className="mt-1 text-xs text-destructive">{emailError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="sup-phone">
              Phone number
            </label>
            <input
              id="sup-phone"
              value={form.phone_number}
              onChange={(e) => set("phone_number", e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="sup-status">
              Status
            </label>
            <select
              id="sup-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className={field}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium" htmlFor="sup-website">
              Website
            </label>
            <input
              id="sup-website"
              value={form.website_url}
              onChange={(e) => set("website_url", e.target.value)}
              placeholder="https://"
              className={field}
            />
          </div>
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
            disabled={hasErrors || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add supplier"}
          </button>
        </div>
      </div>
    </div>
  );
}
