import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { addSupplier, updateSupplier, type SupplierRow } from "@/lib/suppliers.functions";

/** Create / edit dialog for a meter supplier, shared by the listing and details pages. */
export function SupplierDialog({
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
