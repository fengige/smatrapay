import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  addVendingSoftware,
  updateVendingSoftware,
  type VendingSoftwareRow,
} from "@/lib/vending-software.functions";

type Props = {
  software: VendingSoftwareRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const field =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground";

/** Add / edit form for a vending software record. */
export function VendingSoftwareDialog({ software, onClose, onSaved }: Props) {
  const create = useServerFn(addVendingSoftware);
  const update = useServerFn(updateVendingSoftware);

  const [name, setName] = useState(software?.name ?? "");
  const [code, setCode] = useState(software?.code ?? "");
  const [version, setVersion] = useState(software?.version ?? "");
  const [description, setDescription] = useState(software?.description ?? "");
  const [logoUrl, setLogoUrl] = useState(software?.logo_url ?? "");
  const [status, setStatus] = useState(software?.status === "active" ? "active" : "inactive");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        code: code.trim(),
        version: version.trim() || null,
        description: description.trim() || null,
        logo_url: logoUrl.trim() || null,
        status,
      };
      if (software) return update({ data: { ...payload, id: software.id } } as never);
      return create({ data: payload } as never);
    },
    onSuccess: async () => {
      await onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Could not save vending software"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Software name is required");
    if (code.trim().length < 2) return toast.error("Software code is required");
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {software ? "Edit vending software" : "Add vending software"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Software details used when linking meters to a vending platform.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-accent/10">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Software name *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={field} required />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Software code *</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className={field}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Version</span>
              <input value={version} onChange={(e) => setVersion(e.target.value)} className={field} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Logo URL</span>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
              className={field}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
          </label>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {software ? "Save changes" : "Add software"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
