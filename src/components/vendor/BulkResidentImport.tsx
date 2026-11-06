import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { importVendorResidents } from "@/lib/resident-import.functions";
import { parseResidentImport, residentImportCsv, type ResidentImportInput, type ResidentImportResult } from "@/lib/resident-import";

function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

export function BulkResidentImport() {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [saved, setSaved] = useState(false);
  const [rows, setRows] = useState<ResidentImportInput[]>([]), [results, setResults] = useState<ResidentImportResult[]>([]), [error, setError] = useState("");
  const run = useServerFn(importVendorResidents), queryClient = useQueryClient();
  const ready = results.filter(r => r.status === "ready").length;
  const process = async (confirm: boolean, input = rows) => {
    setBusy(true); setError("");
    try {
      const response = await run({ data: { rows: input, confirm } }); setResults(response.results);
      if (confirm) {
        setSaved(true); setConfirmed(false);
        await Promise.all(["vendor-residents", "vendor-assignable-units", "vendor-properties", "vendor-scope"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
        toast.success(`${response.results.filter(r => r.status === "successful").length} residents imported`);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not import residents"); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><Upload /> Bulk Resident Import</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-w-4xl w-[calc(100%-2rem)] max-h-[85dvh] overflow-y-auto" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}>
        <DialogTitle>Bulk Resident Import</DialogTitle>
        <DialogDescription>Name, Email, Unit, Property · Up to 200 residents · Existing units and properties only</DialogDescription>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => download("resident-import-template.csv", residentImportCsv([["Name","Email","Unit","Property"]]))}><Download /> CSV Template</Button>
          <label className="flex-1 min-w-48 text-sm">Resident CSV<Input aria-label="Resident CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={async e => {
            const file = e.target.files?.[0]; setRows([]); setResults([]); setError(""); setConfirmed(false); setSaved(false);
            if (!file) return;
            if (file.size > 1024 * 1024) { setError("Choose a CSV smaller than 1 MB."); return; }
            try { const input = parseResidentImport(await file.text()); setRows(input); await process(false,input); }
            catch (err) { setError(err instanceof Error ? err.message : "Could not read CSV"); }
          }} /></label>
        </div>
        {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="animate-spin size-4" /> {saved ? "Checking residents…" : "Processing residents…"}</p>}
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        {results.length > 0 && <>
          <p role="status" className="text-sm">{results.length} rows · {ready} ready · {results.filter(r=>r.status==="successful").length} successful · {results.filter(r=>r.status==="skipped").length} skipped · {results.filter(r=>r.status==="failed").length} failed</p>
          <div className="max-h-80 overflow-auto border border-border rounded-md"><table className="w-full text-sm"><thead className="bg-muted sticky top-0"><tr>{["Row","Name","Email","Unit","Property","Status","Result"].map(h=><th key={h} className="text-left p-2 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{results.map(r=><tr key={r.row} className="border-t border-border"><td className="p-2">{r.row}</td>{[r.values.name,r.values.email,r.values.unit,r.values.property,r.status,r.reason].map((v,i)=><td key={i} className="p-2 min-w-24 max-w-64 break-words">{v}</td>)}</tr>)}</tbody></table></div>
          {!saved && ready > 0 && <label className="flex items-center gap-2 text-sm"><Checkbox checked={confirmed} disabled={busy} onCheckedChange={v=>setConfirmed(v===true)} /> Create and assign {ready} residents; skip invalid rows</label>}
        </>}
        <DialogFooter className="gap-2 flex-wrap">
          {results.some(r=>r.status==="failed") && <Button variant="outline" onClick={()=>download("resident-import-errors.csv",residentImportCsv([["Row","Name","Email","Unit","Property","Reason"],...results.filter(r=>r.status==="failed").map(r=>[String(r.row),r.values.name,r.values.email,r.values.unit,r.values.property,r.reason])]))}><Download /> Row Errors</Button>}
          <Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Close</Button>
          <Button disabled={busy || !confirmed || !ready || saved} onClick={()=>process(true)}><Upload /> Confirm Import ({ready})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}