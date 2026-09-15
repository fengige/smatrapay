import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { extensionForType, validateProfileImage } from "@/lib/image-upload";

export type ResidentForm = {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  id_number: string;
  address: string;
  status: "active" | "inactive";
  profile_image: string;
};

export const emptyResidentForm: ResidentForm = {
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  phone: "",
  id_number: "",
  address: "",
  status: "active",
  profile_image: "",
};

export function splitName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] ?? "",
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    last_name: parts.length > 1 ? (parts[parts.length - 1] as string) : "",
  };
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

/** Uploads to the shared avatars bucket under the signed-in vendor's own folder. */
export function ResidentPhotoPicker({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (url: string) => void;
  name?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const check = await validateProfileImage(file);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Your session has expired. Please sign in again.");
      const path = `${uid}/residents/${Date.now()}.${extensionForType(file.type)}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: signed, error: signError } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signError || !signed?.signedUrl) throw signError ?? new Error("Could not link the photo");
      onChange(signed.signedUrl);
      toast.success("Photo ready");
    } catch (e) {
      toast.error((e as Error).message || "Could not upload the photo");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      {value ? (
        <img
          src={value}
          alt={name ? `${name} profile photo` : "Resident profile photo"}
          className="size-16 rounded-full object-cover"
        />
      ) : (
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {(name ?? "R").slice(0, 1).toUpperCase()}
        </span>
      )}
      <div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" />}
            {value ? "Change photo" : "Upload photo"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
            >
              <Trash2 className="size-3" /> Remove
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">JPG, PNG or WebP · max 5MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  );
}

export function ResidentFormFields({
  form,
  onChange,
  residentId,
}: {
  form: ResidentForm;
  onChange: (next: ResidentForm) => void;
  residentId?: string;
}) {
  const set = (key: keyof ResidentForm, value: string) =>
    onChange({ ...form, [key]: value } as ResidentForm);

  return (
    <div className="space-y-4">
      <ResidentPhotoPicker
        value={form.profile_image}
        onChange={(url) => set("profile_image", url)}
        name={form.first_name || null}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required>
          <input
            className={inputClass}
            value={form.first_name}
            onChange={(e) => set("first_name", e.target.value)}
          />
        </Field>
        <Field label="Middle name">
          <input
            className={inputClass}
            value={form.middle_name}
            onChange={(e) => set("middle_name", e.target.value)}
          />
        </Field>
        <Field label="Last name" required>
          <input
            className={inputClass}
            value={form.last_name}
            onChange={(e) => set("last_name", e.target.value)}
          />
        </Field>
        <Field label="Email address" required>
          <input
            type="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="name@example.com"
          />
        </Field>
        <Field label="Phone number">
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+254 700 000 000"
          />
        </Field>
        <Field label="ID / identification number">
          <input
            className={inputClass}
            value={form.id_number}
            onChange={(e) => set("id_number", e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <input
              className={inputClass}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Physical or postal address"
            />
          </Field>
        </div>
        <Field label="Status">
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </select>
        </Field>
        {residentId && (
          <Field label="Resident ID">
            <input disabled className={`${inputClass} bg-muted/40`} value={`RES-${residentId.slice(0, 8).toUpperCase()}`} />
          </Field>
        )}
      </div>
    </div>
  );
}

export type AssignableUnit = {
  id: string;
  unit_number: string;
  unit_type: string | null;
  status: string;
  property_id: string | null;
  property_name: string | null;
  zone_id: number | null;
  zone_name: string | null;
  occupant_id: string | null;
  occupant_name: string | null;
};

export function UnitPicker({
  units,
  value,
  onChange,
  required,
}: {
  units: AssignableUnit[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
}) {
  const [zone, setZone] = useState("all");
  const [property, setProperty] = useState("all");

  const zones = [...new Map(units.filter((u) => u.zone_id != null).map((u) => [u.zone_id, u.zone_name]))];
  const properties = [...new Set(units.map((u) => u.property_name).filter(Boolean) as string[])];
  const visible = units.filter(
    (u) =>
      (zone === "all" || String(u.zone_id ?? "") === zone) &&
      (property === "all" || u.property_name === property),
  );
  const selected = units.find((u) => u.id === value) ?? null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Property / unit{required && <span className="ml-0.5 text-destructive">*</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          aria-label="Filter units by zone"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="all">All zones</option>
          {zones.map(([id, name]) => (
            <option key={String(id)} value={String(id)}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={property}
          onChange={(e) => setProperty(e.target.value)}
          aria-label="Filter units by property"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="all">All properties</option>
          {properties.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No units available in your scope.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">Property</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Zone</th>
                <th className="px-3 py-2">Unit status</th>
                <th className="px-3 py-2">Current resident</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <tr
                  key={u.id}
                  className={`border-t border-border/70 ${value === u.id ? "bg-primary/5" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="radio"
                      name="unit-picker"
                      checked={value === u.id}
                      onChange={() => onChange(u.id)}
                      aria-label={`Select unit ${u.unit_number}`}
                    />
                  </td>
                  <td className="px-3 py-2">{u.property_name ?? "—"}</td>
                  <td className="px-3 py-2">{u.unit_number}</td>
                  <td className="px-3 py-2 text-muted-foreground">{u.zone_name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{u.status}</td>
                  <td className="px-3 py-2 text-muted-foreground">{u.occupant_name ?? "Vacant"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected?.occupant_id && (
        <p className="text-xs text-amber-600">
          {selected.occupant_name} currently occupies this unit — choose a vacant unit instead.
        </p>
      )}
    </div>
  );
}
