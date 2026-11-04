import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createVendorPropertyUnit } from "@/lib/vendor-properties.functions";
import { unitInput } from "@/lib/unit-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const emptyForm = {
  unit_number: "", building: "", unit_type: "", bedrooms: "", floor: "",
  status: "vacant", electricity_meter_no: "", water_meter_no: "", gas_meter_no: "", notes: "",
};
const fields = [
  ["unit_number", "Unit number", 40], ["building", "Building", 120],
  ["unit_type", "Unit type", 60], ["floor", "Floor", 30],
  ["electricity_meter_no", "Electricity meter number", 60],
  ["water_meter_no", "Water meter number", 60], ["gas_meter_no", "Gas meter number", 60],
] as const;

export function AddPropertyUnitDialog({ propertyId, propertyName, onClose }: {
  propertyId: string; propertyName: string; onClose: () => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const create = useServerFn(createVendorPropertyUnit);
  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = unitInput.safeParse({ ...form, property_id: propertyId,
        bedrooms: form.bedrooms.trim() === "" ? null : Number(form.bedrooms),
      });
      if (!parsed.success) {
        setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
        throw new Error("Please check the highlighted unit details.");
      }
      setErrors({});
      return create({ data: parsed.data });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendor-property", propertyId] }),
        queryClient.invalidateQueries({ queryKey: ["vendor-properties"] }),
      ]);
      toast.success(`Unit ${form.unit_number.trim()} added`);
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const errorFor = (key: string) => errors[key] ? (
    <p id={`add-unit-${key}-error`} className="text-xs text-destructive">{errors[key]}</p>
  ) : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Add Unit</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending) mutation.mutate();
        }}>
          <div className="space-y-1.5">
            <Label htmlFor="add-unit-property">Property</Label>
            <Input id="add-unit-property" value={propertyName} readOnly />
          </div>
          <fieldset disabled={mutation.isPending} className="grid gap-4 sm:grid-cols-2">
            {fields.map(([key, label, maxLength]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`add-unit-${key}`}>{label}{key === "unit_number" ? " *" : ""}</Label>
                <Input id={`add-unit-${key}`} value={form[key]} maxLength={maxLength}
                  required={key === "unit_number"} autoFocus={key === "unit_number"}
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={errors[key] ? `add-unit-${key}-error` : undefined}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
                {errorFor(key)}
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="add-unit-bedrooms">Bedrooms</Label>
              <Input id="add-unit-bedrooms" type="number" min={0} max={50} step={1}
                value={form.bedrooms} aria-invalid={Boolean(errors["bedrooms"])}
                onChange={(e) => setForm((p) => ({ ...p, bedrooms: e.target.value }))} />
              {errorFor("bedrooms")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-unit-status">Status</Label>
              <select id="add-unit-status" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="vacant">Vacant</option><option value="occupied">Occupied</option>
                <option value="maintenance">Maintenance</option><option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="add-unit-notes">Notes</Label>
              <Textarea id="add-unit-notes" maxLength={1000} value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              {errorFor("notes")}
            </div>
          </fieldset>
          {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin motion-reduce:animate-none" />}
              {mutation.isPending ? "Saving…" : "Save unit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}