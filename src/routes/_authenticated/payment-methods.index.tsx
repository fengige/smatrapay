import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CreditCard,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  addPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
  setPaymentMethodLogo,
  setPaymentMethodStatus,
  updatePaymentMethod,
  type PaymentMethodRow,
} from "@/lib/payment-methods.functions";
import { PortalLayout } from "@/components/PortalLayout";
import { PaymentAccountsPanel } from "@/components/PaymentAccountsPanel";
import { MpesaConfigPanel } from "@/components/MpesaConfigPanel";

export const Route = createFileRoute("/_authenticated/payment-methods/")({
  head: () => ({
    meta: [
      { title: "Payment Methods Setup · SmatraPay" },
      {
        name: "description",
        content:
          "Configure digital and offline payment methods, upload their logos and enable the channels used for collections.",
      },
      { property: "og:title", content: "Payment Methods Setup · SmatraPay" },
      {
        property: "og:description",
        content: "Add, configure, brand and enable the payment channels used for collections.",
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

type Tab = "digital" | "offline";

function PaymentMethodsPage() {
  const queryClient = useQueryClient();
  const fetchMethods = useServerFn(listPaymentMethods);
  const removeMethod = useServerFn(deletePaymentMethod);
  const statusFn = useServerFn(setPaymentMethodStatus);

  const [section, setSection] = useState<"methods" | "accounts">("methods");
  const [tab, setTab] = useState<Tab>("digital");
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [setupId, setSetupId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PaymentMethodRow | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => fetchMethods(),
  });

  const methods = useMemo(() => data?.methods ?? [], [data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return methods
      .filter((m) => m.payment_type === tab)
      .filter((m) =>
        needle
          ? [m.name, m.code, m.description ?? ""].join(" ").toLowerCase().includes(needle)
          : true,
      );
  }, [methods, q, tab]);

  const setupMethod = useMemo(
    () => methods.find((m) => m.id === setupId) ?? null,
    [methods, setupId],
  );

  useEffect(() => {
    if (setupId && !setupMethod) setSetupId(null);
  }, [setupId, setupMethod]);

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

  return (
    <PortalLayout
      roles={["admin"]}
      title="Payment Methods Setup"
      description="Configure the digital and offline channels available for collections"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            hidden={section !== "methods"}
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

      <div
        role="tablist"
        aria-label="Payment methods sections"
        className="mb-4 flex flex-wrap items-center gap-2 border-b border-border"
      >
        {(
          [
            ["methods", "Payment Methods"],
            ["accounts", "Payment Accounts"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={section === key}
            onClick={() => setSection(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              section === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "methods" && (
      <>
      <div

        role="tablist"
        aria-label="Payment method groups"
        className="flex flex-wrap items-center gap-2"
      >
        {(
          [
            ["digital", "Digital payment"],
            ["offline", "Offline payment"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
              tab === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <p>
              Configure each payment gateway with its credentials (e.g. API keys) from the provider
              before enabling it.
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>To collect {tab} payments you need at least one configured method.</li>
              <li>Upload a logo so the method is recognisable in the app and receipts.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
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

      <section className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold text-foreground">
          {tab === "digital" ? "Digital" : "Offline"} Payment Methods List
        </h2>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="mx-auto size-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No {tab} payment methods yet. Use “Add Payment Method” to create one.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {rows.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <MethodLogo method={m} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-foreground">{m.name}</span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-medium uppercase text-emerald-600">
                        {m.environment}
                      </span>
                      {!m.is_configured && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[0.65rem] font-medium text-destructive">
                          Not Configured
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.description || m.code}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Toggle
                    checked={m.is_active}
                    disabled={statusMutation.isPending}
                    label={`${m.is_active ? "Disable" : "Enable"} ${m.name}`}
                    onChange={(next) => statusMutation.mutate({ id: m.id, is_active: next })}
                  />
                  <button
                    type="button"
                    onClick={() => setSetupId(m.id)}
                    aria-label={`Set up ${m.name}`}
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                  >
                    <Settings className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(m)}
                    aria-label={`Delete ${m.name}`}
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </>
      )}

      {section === "accounts" && <PaymentAccountsPanel methods={methods} />}


      {showAdd && <MethodDialog defaultType={tab} onClose={() => setShowAdd(false)} />}
      {setupMethod && <SetupDrawer method={setupMethod} onClose={() => setSetupId(null)} />}

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

function MethodLogo({ method, size = 40 }: { method: PaymentMethodRow; size?: number }) {
  if (method.logo_url) {
    return (
      <img
        src={method.logo_url}
        alt={`${method.name} logo`}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-lg border border-border bg-background object-contain p-1"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
      style={{ width: size, height: size }}
    >
      <CreditCard className="size-4" />
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-background transition-all ${
          checked ? "left-[1.375rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function SetupDrawer({ method, onClose }: { method: PaymentMethodRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(setPaymentMethodStatus);
  const logoFn = useServerFn(setPaymentMethodLogo);
  const fileRef = useRef<HTMLInputElement>(null);

  const isMpesa = /m-?pesa|daraja/i.test(`${method.code} ${method.name}`);

  const [isActive, setIsActive] = useState(method.is_active);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(method.logo_url);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return;
    if (!/^image\/(png|jpeg|jpg|gif|webp)$/.test(f.type)) {
      setError("Use a JPEG, PNG, JPG, GIF or WEBP image");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setError("Image must be 2MB or smaller");
      return;
    }
    setFile(f);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (file) {
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const path = `${method.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("payment-logos")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (uploadError) throw new Error(uploadError.message);
        await logoFn({ data: { id: method.id, path } } as never);
      }
      if (isActive !== method.is_active) {
        await statusFn({ data: { id: method.id, is_active: isActive } } as never);
      }
      return true;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      toast.success(`${method.name} updated`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not save payment method setup"),
  });

  const removeLogo = useMutation({
    mutationFn: () => logoFn({ data: { id: method.id, path: null } } as never),
    onSuccess: async () => {
      setFile(null);
      setPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      toast.success("Logo removed");
    },
    onError: (e: Error) => toast.error(e.message || "Could not remove logo"),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close setup panel" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Setup ${method.name}`}
        className={`relative z-10 flex h-full w-full flex-col overflow-y-auto border-l border-border bg-card ${
          isMpesa ? "max-w-3xl" : "max-w-md"
        }`}
      >
        <header className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-base font-bold text-foreground">Setup - {method.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-5 p-5">
          {!method.is_configured && (
            <div className="flex gap-2 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>Please configure your payment method before enabling the status.</p>
            </div>
          )}

          <div className="rounded-xl bg-muted/40 p-4">
            <p className="font-semibold text-foreground">{method.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              If you turn this off, customers cannot pay through this payment gateway.
            </p>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
              <span className="text-sm font-medium text-foreground">Status</span>
              <Toggle
                checked={isActive}
                onChange={setIsActive}
                label={`Toggle ${method.name} status`}
              />
            </div>
          </div>

          <div className="rounded-xl bg-muted/40 p-4">
            <p className="font-semibold text-foreground">
              Choose Logo <span className="text-destructive">*</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">It will show in website &amp; app.</p>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-3 flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-background"
            >
              {preview ? (
                <img
                  src={preview}
                  alt={`${method.name} logo preview`}
                  className="max-h-full max-w-full object-contain p-2"
                />
              ) : (
                <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="size-6" /> Click to upload a logo
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              JPEG, PNG, JPG, GIF, WEBP · Max 2MB (Ratio 3 : 1)
            </p>
            {error && <p className="mt-1 text-center text-xs text-destructive">{error}</p>}
            {method.logo_path && (
              <button
                type="button"
                onClick={() => removeLogo.mutate()}
                disabled={removeLogo.isPending}
                className="mt-2 w-full text-center text-xs font-medium text-destructive hover:underline disabled:opacity-60"
              >
                Remove current logo
              </button>
            )}
          </div>

          {isMpesa && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-foreground">API Settings</h3>
                <p className="text-xs text-muted-foreground">
                  Safaricom Daraja integration settings. Credentials are stored securely on the
                  server and never shown again after saving.
                </p>
              </div>
              <MpesaConfigPanel paymentMethodId={method.id} />
            </div>
          )}
        </div>

        <footer className="mt-auto grid grid-cols-2 gap-3 border-t border-border p-5">
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setPreview(method.logo_url);
              setIsActive(method.is_active);
              setError(null);
            }}
            className="rounded-lg bg-muted px-4 py-2.5 text-sm font-semibold text-foreground"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Submit
          </button>
        </footer>
      </aside>
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
      <button aria-label="Close dialog" className="absolute inset-0 bg-black/50" onClick={onClose} />
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
  defaultType,
  onClose,
}: {
  method?: PaymentMethodRow;
  defaultType?: Tab;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(addPaymentMethod);
  const update = useServerFn(updatePaymentMethod);

  const [name, setName] = useState(method?.name ?? "");
  const [code, setCode] = useState(method?.code ?? "");
  const [description, setDescription] = useState(method?.description ?? "");
  const [paymentType, setPaymentType] = useState<Tab>(
    method?.payment_type ?? defaultType ?? "digital",
  );
  const [isActive, setIsActive] = useState(method?.is_active ?? false);
  const [isConfigured, setIsConfigured] = useState(method?.is_configured ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        code: code.trim().toLowerCase(),
        description: description.trim() || null,
        payment_type: paymentType,
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
          <label htmlFor="pm-type" className="mb-1 block text-sm font-medium">
            Payment Type
          </label>
          <select
            id="pm-type"
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value as Tab)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="digital">Digital payment</option>
            <option value="offline">Offline payment</option>
          </select>
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
