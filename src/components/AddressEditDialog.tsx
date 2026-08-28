import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { updateProperty } from "@/lib/properties.functions";
import { COUNTRY_GROUPS, STATE_MAP } from "@/lib/countries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40";

type AddressForm = {
  address_line1: string;
  address_line2: string;
  city: string;
  country: string;
  state: string;
  postal_code: string;
};

export function AddressEditDialog({
  property,
  open,
  onOpenChange,
}: {
  property: Record<string, string | null> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const saveAddress = useServerFn(updateProperty);

  const [form, setForm] = useState<AddressForm>({
    address_line1: "",
    address_line2: "",
    city: "",
    country: "Kenya",
    state: "",
    postal_code: "",
  });
  const [pendingCountry, setPendingCountry] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open && property) {
      setForm({
        address_line1: property["address_line1"] ?? "",
        address_line2: property["address_line2"] ?? "",
        city: property["city"] ?? "",
        country: property["country"] || "Kenya",
        state: property["state"] ?? "",
        postal_code: property["postal_code"] ?? "",
      });
      setPendingCountry(null);
      setFormError(null);
    }
  }, [open, property]);

  const selectCountryValue = pendingCountry ?? form.country;
  const stateOptions = useMemo(
    () => (form.country ? STATE_MAP[form.country] : undefined),
    [form.country],
  );

  const handleCountryChange = (country: string) => {
    if (country === form.country) {
      setPendingCountry(null);
      return;
    }
    if (!form.state.trim() || STATE_MAP[country]?.includes(form.state)) {
      setForm((f) => ({
        ...f,
        country,
        state: STATE_MAP[country]?.includes(f.state) ? f.state : "",
      }));
      setPendingCountry(null);
    } else {
      setPendingCountry(country);
    }
  };

  const confirmCountryChange = () => {
    if (!pendingCountry) return;
    setForm((f) => ({ ...f, country: pendingCountry, state: "" }));
    setPendingCountry(null);
  };

  const cancelCountryChange = () => setPendingCountry(null);

  const fullAddress = useMemo(
    () =>
      [
        form.address_line1,
        form.address_line2,
        form.city,
        form.state,
        form.postal_code,
        form.country,
      ]
        .filter(Boolean)
        .join(", ") || "No address entered yet.",
    [form],
  );

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      saveAddress({ data: payload } as never),
    onSuccess: async () => {
      toast.success("Address updated", {
        description: `${property?.["name"] ?? "The property"}'s address was saved.`,
      });
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["properties"] });
      await queryClient.invalidateQueries({
        queryKey: ["address-audit-logs", property?.["id"]],
      });
    },
    onError: (err: Error) => {
      setFormError(err.message || "Could not save address");
      toast.error(err.message || "Could not save address");
    },
  });

  const set = (key: keyof AddressForm) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    if (!form.country.trim()) {
      setFormError("Country is required");
      return;
    }
    if (stateOptions && !stateOptions.includes(form.state)) {
      setFormError(`Please select a valid state/county for ${form.country}`);
      return;
    }
    setFormError(null);
    mutation.mutate({
      id: property?.["id"],
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim(),
      state: form.state.trim() || null,
      postal_code: form.postal_code.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-busy={mutation.isPending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" /> Edit address
          </DialogTitle>
          <DialogDescription>
            Update only the address for {property?.["name"] ?? "this property"}. Other
            property details are not affected.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Address line 1
            </label>
            <input
              className={inputClass}
              value={form.address_line1}
              onChange={(e) => set("address_line1")(e.target.value)}
              placeholder="Street, building, plot…"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Address line 2 <span className="font-normal">(optional)</span>
            </label>
            <input
              className={inputClass}
              value={form.address_line2}
              onChange={(e) => set("address_line2")(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              City / Town
            </label>
            <input
              className={inputClass}
              value={form.city}
              onChange={(e) => set("city")(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Country <span className="text-destructive">*</span>
            </label>
            <select
              className={inputClass}
              value={selectCountryValue}
              onChange={(e) => handleCountryChange(e.target.value)}
            >
              {COUNTRY_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {pendingCountry && (
              <div className="mt-2 rounded-lg border border-border bg-accent/10 p-3">
                <p className="flex items-start gap-2 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>
                    Changing the country to <strong>{pendingCountry}</strong> will reset your
                    State / County selection. Continue?
                  </span>
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelCountryChange}
                    className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-accent/10"
                  >
                    Keep current
                  </button>
                  <button
                    type="button"
                    onClick={confirmCountryChange}
                    className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Continue & reset
                  </button>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              State / County {stateOptions && <span className="text-destructive">*</span>}
            </label>
            {stateOptions ? (
              <select
                className={inputClass}
                value={form.state}
                onChange={(e) => set("state")(e.target.value)}
              >
                <option value="">Select county…</option>
                {stateOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputClass}
                value={form.state}
                onChange={(e) => set("state")(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Postal code
            </label>
            <input
              className={inputClass}
              value={form.postal_code}
              onChange={(e) => set("postal_code")(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Live address preview
          </p>
          <p className="mt-1.5 text-sm font-medium text-foreground">{fullAddress}</p>
        </div>

        {formError && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
            {formError}
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent/10 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Save address
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
