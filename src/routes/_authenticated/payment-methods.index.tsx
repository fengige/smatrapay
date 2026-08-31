import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  addPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
  setPaymentMethodStatus,
  updatePaymentMethod,
  type PaymentMethodRow,
} from "@/lib/payment-methods.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/payment-methods/")({
  head: () => ({
    meta: [
      { title: "Payment Methods · SmatraPay" },
      {
        name: "description",
        content:
          "Configure the digital payment methods available for collections — mobile money and bank channels.",
      },
      { property: "og:title", content: "Payment Methods · SmatraPay" },
      {
        property: "og:description",
        content: "Add, edit, enable or disable the payment channels used for collections.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentMethodsPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

const PAGE_SIZE = 10;

function PaymentMethodsPage() {
  const queryClient = useQueryClient();
  const fetchMethods = useServerFn(listPaymentMethods);
  const removeMethod = useServerFn(deletePaymentMethod);
  const statusFn = useServerFn(setPaymentMethodStatus);

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<PaymentMethodRow | null>(null);
  const [viewing, setViewing] = useState<PaymentMethodRow | null>(null);
  const [deleting, setDeleting] = useState<PaymentMethodRow | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => fetchMethods(),
  });

  const methods = data?.methods ?? [];

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return methods;
    return methods.filter((m) =>
      [m.name, m.code, m.description ?? ""].join(" ").toLowerCase().includes(needle),
    );
  }, [methods, q]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeMethod({ data: { id } } as never),
    onSuccess: async () => {
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      toast.success("Payment method deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete payment method"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      statusFn({ data: { id, is_active } } as never),
    onSuccess: async (_r, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      toast.success(vars.is_active ? "Payment method enabled" : "Payment method disabled");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update status"),
  });

  const activeCount = methods.filter((m) => m.is_active).length;
  const configuredCount = methods.filter((m) => m.is_configured).length;

  return (
    <PortalLayout
      roles={["admin"]}
      title="Payment Methods"
      description="Digital payment channels available for collections"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Payment Method
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh payment methods"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
        Configurations <span aria-hidden="true">/</span>{" "}
        <span className="font-medium text-foreground">Payment Methods</span>
      </nav>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total methods</span>
            <CreditCard className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold">{methods.length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Enabled</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">{activeCount}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Configured</span>
            <Power className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold">{configuredCount}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by payment method name"
            aria-label="Search payment methods"
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Payment method</th>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && !rows.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No payment methods match your search. Use “Add Payment Method” to create one.
                </td>
              </tr>
            )}
            {paged.map((m) => (
              <tr key={m.id} className="border-t border-border/70">
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{m.name}</span>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-medium uppercase text-emerald-600">
                      {m.environment}
                    </span>
                    {!m.is_configured && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[0.65rem] font-medium text-destructive">
                        Not Configured
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.code}</td>
                <td className="max-w-md px-4 py-3">
                  <span className="line-clamp-2">{m.description ?? "—"}</span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      m.is_active
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {m.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setViewing(m)}
                      aria-label={`View ${m.name}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                    >
                      <Eye className="size-3.5" /> View
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(m)}
                      aria-label={`Edit ${m.name}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10"
                    >
                      <Pencil className="size-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        statusMutation.mutate({ id: m.id, is_active: !m.is_active })
                      }
                      disabled={statusMutation.isPending}
                      aria-label={`${m.is_active ? "Disable" : "Enable"} ${m.name}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/10 disabled:opacity-60"
                    >
                      <Power className="size-3.5" /> {m.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(m)}
                      aria-label={`Delete ${m.name}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
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

      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-xs">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showAdd && <MethodDialog onClose={() => setShowAdd(false)} />}
      {editing && <MethodDialog method={editing} onClose={() => setEditing(null)} />}

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          <dl className="space-y-3 text-sm">
            <Row label="Code" value={viewing.code} />
            <Row label="Description" value={viewing.description ?? "—"} />
            <Row label="Environment" value={viewing.environment} />
            <Row label="Configured" value={viewing.is_configured ? "Yes" : "No"} />
            <Row label="Status" value={viewing.is_active ? "Active" : "Inactive"} />
            <Row label="Created" value={new Date(viewing.created_at).toLocaleString()} />
            <Row label="Updated" value={new Date(viewing.updated_at).toLocaleString()} />
          </dl>
        </Modal>
      )}

      {deleting && (
        <Modal title="Delete payment method" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-medium text-foreground">{deleting.name}</span>? This
            cannot be undone.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate(deleting.id)}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
            >
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />} Delete
            </button>
          </div>
        </Modal>
      )}
    </PortalLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <h2 className="mb-4 text-base font-bold text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function MethodDialog({
  method,
  onClose,
}: {
  method?: PaymentMethodRow;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(addPaymentMethod);
  const update = useServerFn(updatePaymentMethod);

  const [name, setName] = useState(method?.name ?? "");
  const [code, setCode] = useState(method?.code ?? "");
  const [description, setDescription] = useState(method?.description ?? "");
  const [isActive, setIsActive] = useState(method?.is_active ?? false);
  const [isConfigured, setIsConfigured] = useState(method?.is_configured ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        code: code.trim().toLowerCase(),
        description: description.trim() || null,
        is_active: isActive,
        is_configured: isConfigured,
      };
      return method
        ? update({ data: { ...payload, id: method.id } } as never)
        : create({ data: payload } as never);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      toast.success(method ? "Payment method updated" : "Payment method added");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not save payment method"),
  });

  function submit() {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next["name"] = "Payment method name is required";
    if (code.trim().length < 2) next["code"] = "Payment method code is required";
    else if (!/^[a-z0-9_-]+$/i.test(code.trim()))
      next["code"] = "Only letters, numbers, dashes and underscores";
    setErrors(next);
    if (Object.keys(next).length) return;
    mutation.mutate();
  }

  return (
    <Modal title={method ? "Edit Payment Method" : "Add Payment Method"} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="pm-name" className="mb-1 block text-sm font-medium">
            Payment Method Name
          </label>
          <input
            id="pm-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          />
          {errors["name"] && <p className="mt-1 text-xs text-destructive">{errors["name"]}</p>}
        </div>
        <div>
          <label htmlFor="pm-code" className="mb-1 block text-sm font-medium">
            Payment Method Code
          </label>
          <input
            id="pm-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. mpesa"
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          />
          {errors["code"] && <p className="mt-1 text-xs text-destructive">{errors["code"]}</p>}
        </div>
        <div>
          <label htmlFor="pm-desc" className="mb-1 block text-sm font-medium">
            Description
          </label>
          <textarea
            id="pm-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isConfigured}
              onChange={(e) => setIsConfigured(e.target.checked)}
            />
            Configured
          </label>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          {method ? "Save changes" : "Add payment method"}
        </button>
      </div>
    </Modal>
  );
}
