import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createVendorPropertyUnitsBulk } from "@/lib/vendor-properties.functions";
import {
  csvToUnitRows, UNIT_BULK_MAX, validateUnitRows, type UnitRowValues,
} from "@/lib/unit-bulk";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "bulk" | "csv";
const blank = (): UnitRowValues => ({ unit_number: "", building: "", unit_type: "", bedrooms: "", floor: "", status: "vacant" });
const cols = [
  ["unit_number", "Unit no. *"], ["building", "Building"], ["unit_type", "Type"],
  ["bedrooms", "Beds"], ["floor", "Floor"], ["electricity_meter_no", "Elec. meter"],
] as const;

export function BulkPropertyUnitsDialog({ mode, propertyId, propertyName, existingUnitNumbers, onClose }: {
  mode: Mode; propertyId: string; propertyName: string; existingUnitNumbers: string[]; onClose: () => void;
}) {
  const [rows, setRows] = useState<UnitRowValues[]>(mode === "bulk" ? [blank(), blank(), blank()] : []);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();
  const bulk = useServerFn(createVendorPropertyUnitsBulk);

  // In bulk mode ignore fully blank rows.
  const activeRows = useMemo(() => mode === "bulk"
    ? rows.filter((r) => Object.entries(r).some(([k, v]) => k !== "status" && (v ?? "").trim() !== ""))
    : rows, [rows, mode]);
  const validated = useMemo(() => validateUnitRows(propertyId, activeRows, existingUnitNumbers),
    [propertyId, activeRows, existingUnitNumbers]);
  const invalid = validated.filter((v) => v.errors.length).length;
  const tooMany = validated.length > UNIT_BULK_MAX;

  const mutation = useMutation({
    mutationFn: () => bulk({ data: { property_id: propertyId, units: validated.map((v) => v.input!) } }),
    onSuccess: async (res) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendor-property", propertyId] }),
        queryClient.invalidateQueries({ queryKey: ["vendor-properties"] }),
      ]);
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length === 0) { toast.success(`${res.created} unit(s) added`); onClose(); return; }
      setConfirming(false);
      setServerErrors(Object.fromEntries(failed.map((f) => [f.index, f.error ?? "Failed"])));
      toast.warning(`${res.created} added, ${failed.length} failed — see row errors`);
      // keep only failed rows so the vendor can correct and retry
      const failedIdx = new Set(failed.map((f) => f.index));
      setRows(activeRows.filter((_, i) => failedIdx.has(i)));
      setServerErrors(Object.fromEntries(failed.map((f, i) => [i, f.error ?? "Failed"])));
    },
    onError: (e: Error) => toast.error(e.message || "Could not add units"),
  });

  const onFile = async (file: File | undefined) => {
    setFileError(""); setRows([]); setServerErrors({}); setConfirming(false);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { setFileError("Please choose a .csv file."); return; }
    if (file.size > 1_000_000) { setFileError("File is larger than 1 MB."); return; }
    setFileName(file.name);
    const { rows: parsed, error } = csvToUnitRows(await file.text());
    if (error) { setFileError(error); return; }
    if (parsed.length === 0) { setFileError("No unit rows found below the header."); return; }
    setRows(parsed);
  };

  const canSubmit = validated.length > 0 && invalid === 0 && !tooMany && !mutation.isPending;
  const title = mode === "bulk" ? "Add Bulk Units" : "Import Units from CSV";

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !mutation.isPending) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-property">Property</Label>
          <Input id="bulk-property" value={propertyName} readOnly />
        </div>

        {mode === "csv" && (
          <div className="space-y-1.5">
            <Label htmlFor="bulk-csv">CSV file</Label>
            <Input id="bulk-csv" type="file" accept=".csv,text/csv" disabled={mutation.isPending}
              onChange={(e) => void onFile(e.target.files?.[0])} />
            <p className="text-xs text-muted-foreground">Use the CSV template. Up to {UNIT_BULK_MAX} rows. Units are added to this property only.</p>
            {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
          </div>
        )}

        {validated.length > 0 || mode === "bulk" ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">#</th>
                  {cols.map(([k, l]) => <th key={k} className="px-2 py-2">{l}</th>)}
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">{mode === "csv" ? "Validation" : ""}</th>
                </tr>
              </thead>
              <tbody>
                {(mode === "bulk" ? rows : activeRows).map((r, i) => {
                  const v = mode === "bulk"
                    ? validated[activeRows.indexOf(r)] : validated[i];
                  const errs = [...(v?.errors ?? []), ...(serverErrors[mode === "bulk" ? activeRows.indexOf(r) : i] ? [serverErrors[mode === "bulk" ? activeRows.indexOf(r) : i]!] : [])];
                  return (
                    <tr key={i} className="border-t border-border align-top">
                      <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                      {cols.map(([k]) => (
                        <td key={k} className="px-1 py-1">
                          {mode === "bulk" ? (
                            <Input aria-label={`Row ${i + 1} ${k}`} value={r[k] ?? ""} disabled={mutation.isPending}
                              className="h-8 min-w-24" inputMode={k === "bedrooms" ? "numeric" : undefined}
                              onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))} />
                          ) : <span className="block px-1 py-1">{r[k] || "—"}</span>}
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        {mode === "bulk" ? (
                          <select aria-label={`Row ${i + 1} status`} className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                            value={r.status ?? "vacant"} disabled={mutation.isPending}
                            onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, status: e.target.value } : x))}>
                            <option value="vacant">Vacant</option><option value="occupied">Occupied</option>
                            <option value="maintenance">Maintenance</option><option value="archived">Archived</option>
                          </select>
                        ) : <span className="block px-1 py-1">{r.status || "vacant"}</span>}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {errs.length ? <ul className="space-y-0.5 text-destructive">{errs.map((e) => <li key={e}>{e}</li>)}</ul>
                          : mode === "csv" ? <span className="text-primary">OK</span>
                          : rows.length > 1 && (
                            <Button type="button" size="icon" variant="ghost" aria-label={`Remove row ${i + 1}`}
                              onClick={() => setRows((p) => p.filter((_, j) => j !== i))}><Trash2 /></Button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {mode === "bulk" && (
          <Button type="button" variant="outline" size="sm" className="w-fit" disabled={rows.length >= UNIT_BULK_MAX || mutation.isPending}
            onClick={() => setRows((p) => [...p, blank()])}><Plus />Add row</Button>
        )}

        {validated.length > 0 && (
          <p className="text-sm" role="status">
            {validated.length} row(s) · {validated.length - invalid} valid · {invalid} with errors
            {fileName && ` · ${fileName}`}
            {tooMany && <span className="text-destructive"> · maximum {UNIT_BULK_MAX} rows</span>}
          </p>
        )}

        {confirming ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p>Create {validated.length} unit(s) under <strong>{propertyName}</strong>?</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" disabled={mutation.isPending} onClick={() => setConfirming(false)}>Back</Button>
              <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
                {mutation.isPending && <Loader2 className="animate-spin motion-reduce:animate-none" />}
                {mutation.isPending ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!canSubmit} onClick={() => { setServerErrors({}); setConfirming(true); }}>
              {mode === "csv" ? "Import units" : "Save units"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
