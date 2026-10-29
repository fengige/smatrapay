import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getVendorPaygSummary, saveVendorPaygSummary } from "@/lib/payg-summary.functions";
import { paygSummarySchema } from "@/lib/payg-summary";
import { PaygHowItWorks } from "./PaygCatalog";

export function VendorPaygSummary() {
  const read = useServerFn(getVendorPaygSummary);
  const save = useServerFn(saveVendorPaygSummary);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["vendor-payg-summary"], queryFn: () => read() });
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (busy || draft === null) return;
    const parsed = paygSummarySchema.safeParse({ summary_text: draft });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid summary"); return; }
    setBusy(true);
    try {
      const saved = await save({ data: parsed.data });
      qc.setQueryData(["vendor-payg-summary"], saved);
      setDraft(null);
      toast.success("Summary details saved");
    } catch { setError("Could not save summary details. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <div className="flex justify-end"><Button variant="outline" disabled={!query.data || query.isError} onClick={() => { setDraft(query.data?.summary_text ?? ""); setError(""); }}><Pencil className="mr-2 h-4 w-4" />Edit Summary Details</Button></div>
    {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading summary details…</p> : query.isError ? <div className="text-sm text-destructive">Could not load summary details. <Button variant="ghost" onClick={() => query.refetch()}>Try again</Button></div> : <PaygHowItWorks summary={query.data.summary_text} />}
    <Dialog open={draft !== null} onOpenChange={open => { if (!open && !busy) setDraft(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Summary Details</DialogTitle></DialogHeader>
        <Label htmlFor="payg-summary">Service summary / how it works</Label>
        <Textarea id="payg-summary" value={draft ?? ""} onChange={e => setDraft(e.target.value)} maxLength={10000} rows={14} disabled={busy} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button><Button disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save Summary Details"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}