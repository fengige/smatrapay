import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { exportAssignmentCsvTemplate, getAssignmentCsvScope, importAssignmentCsv } from "@/lib/meter-assignment-csv.functions";
import { ASSIGNMENT_COLUMNS, ASSIGNMENT_LIMIT, assignmentErrorCsv, type AssignmentRow } from "@/lib/meter-assignment-csv";

function download(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BulkMeterAssignment({ portal }: { portal: "admin" | "vendor" }) {
  const [open, setOpen] = useState(false), [propertyId, setPropertyId] = useState("");
  const [csv, setCsv] = useState(""), [rows, setRows] = useState<AssignmentRow[]>([]);
  const [confirmed, setConfirmed] = useState(false), [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false), [exporting, setExporting] = useState(false), [error, setError] = useState("");
  const scopeFn = useServerFn(getAssignmentCsvScope), templateFn = useServerFn(exportAssignmentCsvTemplate), importFn = useServerFn(importAssignmentCsv);
  const queryClient = useQueryClient();
  const scope = useQuery({ queryKey: ["assignment-csv-scope", portal], queryFn: () => scopeFn({ data: { portal } }), enabled: open });
  const clear = () => { setRows([]); setConfirmed(false); setAccepted(false); setError(""); };
  const exportTemplate = async () => {
    setExporting(true);
    try {
      const result = await templateFn({ data: { portal, propertyId: propertyId || null } });
      download(result.csv, `meter-assignment-template-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(result.hasExample ? "Template downloaded with an eligible example from your records" : "Template downloaded; no eligible example is available in this scope");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Template download failed"); }
    finally { setExporting(false); }
  };
  const validate = async (text: string, save = false) => {
    setBusy(true); setError("");
    try {
      const result = await importFn({ data: { portal, propertyId: propertyId || null, csv: text, confirm: save } });
      setRows(result.rows); setConfirmed(result.confirmed); setAccepted(false);
      if (save) {
        await Promise.all(["admin-assignments", "vendor-scope", "vendor-units", "meters", "vendor-property", "property-detail", "landlord-properties", "landlord-property-detail"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
        toast.success("Import finished; review the row results");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed; refresh and retry safely"); }
    finally { setBusy(false); }
  };
  const ready = rows.filter(r => r.status === "ready").length;
  const successful = rows.filter(r => r.status === "successful").length;
  const skipped = rows.filter(r => r.status === "skipped").length;
  const failed = rows.filter(r => r.status === "failed").length;
  return <>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={exportTemplate} disabled={exporting}><Download />{exporting ? "Preparing…" : "Export CSV Template"}</Button>
      <Button onClick={() => { setOpen(true); setCsv(""); clear(); }}><Upload />Import CSV</Button>
    </div>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>Bulk Meter Assignment</DialogTitle><DialogDescription>
          {portal === "admin" ? "All administrator-permitted records, or one selected property." : "Only your authorized meters, residents, units and properties."} Existing records only; assignments elsewhere are not moved.
        </DialogDescription></DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm"><span>Property scope</span><select aria-label="Import property scope" className="input w-full" disabled={busy || scope.isLoading || Boolean(scope.error)} value={propertyId} onChange={e => { setPropertyId(e.target.value); clear(); }}>
            <option value="">All permitted properties</option>{scope.data?.properties.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` · ${p.code}` : ""}</option>)}
          </select></label>
          {scope.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading permitted properties…</p>}
          {scope.error && <div className="flex items-center gap-2"><p role="alert" className="text-sm text-destructive">Unable to load permitted properties.</p><Button variant="outline" size="sm" onClick={() => scope.refetch()}>Retry</Button></div>}
          <p className="text-xs text-muted-foreground">Columns: Meter, Type, Resident, Unit, Property. All five are required. Meter: exact number or ID; Type: Electricity, Water or Gas; Resident: email, ID or unique name; Unit: ID or exact unit name within the property; Property: ID, code or unique name. Keep leading zeros as text in your spreadsheet. Up to {ASSIGNMENT_LIMIT} rows.</p>
          <Button variant="outline" size="sm" onClick={exportTemplate} disabled={exporting || busy}><Download />Export scoped template</Button>
          <p className="text-xs text-muted-foreground">The template includes a real eligible example when available. Resident, Unit and Property IDs avoid ambiguous names. Remove the example if you do not want to assign it.</p>
          <label className="block space-y-1 text-sm"><span>CSV file</span><input aria-label="Assignment CSV file" className="input w-full" type="file" accept=".csv,text/csv" disabled={busy || Boolean(scope.error) || scope.isLoading} onChange={async e => {
            const file = e.target.files?.[0]; clear(); setCsv("");
            if (!file) return;
            if (!/\.csv$/i.test(file.name) || file.size > 1024 * 1024) { setError("Choose a CSV file no larger than 1 MB"); return; }
            try { const text = await file.text(); setCsv(text); await validate(text); } catch { setError("Unable to read this file"); }
          }} /></label>
          {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />{accepted ? "Saving assignments…" : "Checking records…"}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!rows.length && !busy && !error && <p className="text-sm text-muted-foreground">No rows selected.</p>}
          {rows.length > 0 && <>
            <p role="status" className="text-sm font-medium">{confirmed ? `${successful} successful` : `${ready} ready`} · {skipped} skipped · {failed} failed · {rows.length} total</p>
            <div className="max-h-80 overflow-auto border border-border rounded-md"><table className="w-full text-left text-xs"><thead className="bg-muted"><tr>{["Row", ...ASSIGNMENT_COLUMNS, "Result"].map(c => <th key={c} className="px-3 py-2">{c}</th>)}</tr></thead><tbody>
              {rows.map(r => <tr key={r.row} className="border-t border-border"><td className="px-3 py-2">{r.row}</td>{ASSIGNMENT_COLUMNS.map(c => <td key={c} className="max-w-48 break-words px-3 py-2">{r.values[c] || "—"}</td>)}<td className={`min-w-52 px-3 py-2 ${r.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}><strong>{r.status}</strong>: {r.reason}</td></tr>)}
            </tbody></table></div>
            {(failed > 0 || skipped > 0) && <Button variant="outline" size="sm" onClick={() => download(assignmentErrorCsv(rows), `meter-assignment-errors-${new Date().toISOString().slice(0, 10)}.csv`)}><Download />Download error CSV</Button>}
            {!confirmed && ready > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted} disabled={busy} onChange={e => setAccepted(e.target.checked)} />I confirm these {ready} assignments. Skipped and failed rows will not be saved.</label>}
          </>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Close</Button>
          {csv && <Button variant="outline" disabled={busy} onClick={() => { clear(); void validate(csv); }}>Revalidate</Button>}
          {!confirmed && <Button disabled={busy || !accepted || !ready} onClick={() => validate(csv, true)}><Upload />Confirm assignments</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}