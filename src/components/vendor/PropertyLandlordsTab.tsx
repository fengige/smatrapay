import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { assignPropertyLandlord, listPropertyLandlords, removePropertyLandlord } from "@/lib/property-landlords.functions";
import { listVendorLandlords } from "@/lib/vendor-landlords.functions";
import { EmptyState, ErrorBlock, formatDate, LoadingBlock } from "@/components/vendor/VendorUI";

export function PropertyLandlordsTab({ propertyId, vendorName }: { propertyId: string; vendorName: string }) {
  const qc = useQueryClient();
  const key = ["property-landlords", propertyId];
  const listFn = useServerFn(listPropertyLandlords);
  const list = useQuery({ queryKey: key, queryFn: () => listFn({ data: { property_id: propertyId } }) });
  const candidatesFn = useServerFn(listVendorLandlords);
  const candidates = useQuery({ queryKey: ["vendor-landlords"], queryFn: () => candidatesFn() });
  const assignFn = useServerFn(assignPropertyLandlord);
  const removeFn = useServerFn(removePropertyLandlord);
  const [selected, setSelected] = useState("");
  const done = (msg: string) => { toast.success(msg); setSelected(""); void qc.invalidateQueries({ queryKey: key }); };
  const assign = useMutation({ mutationFn: () => assignFn({ data: { property_id: propertyId, landlord_id: selected } }), onSuccess: () => done("Landlord assigned"), onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: (id: string) => removeFn({ data: { property_id: propertyId, landlord_id: id } }), onSuccess: () => done("Landlord removed"), onError: (e: Error) => toast.error(e.message) });

  const assigned = new Set((list.data ?? []).map((l) => l.id));
  const available = (candidates.data?.landlords ?? []).filter((l) => !assigned.has(l.id));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <span className="text-muted-foreground">Managing vendor: </span><span className="font-medium">{vendorName}</span>
        <p className="mt-1 text-xs text-muted-foreground">Assigned landlords can view reports for every unit and meter in this property.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm" disabled={candidates.isLoading}>
          <option value="">{candidates.isLoading ? "Loading landlords…" : available.length ? "Select landlord" : "No more landlords to assign"}</option>
          {available.map((l) => <option key={l.id} value={l.id}>{l.name || l.email}</option>)}
        </select>
        <Button disabled={!selected || assign.isPending} onClick={() => assign.mutate()}>{assign.isPending ? "Assigning…" : "Assign landlord"}</Button>
      </div>
      {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorBlock message={(list.error as Error).message} /> :
        !list.data?.length ? <EmptyState title="No landlords assigned" message="Assign landlords so they can view this property's reports." /> :
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Name</th><th className="p-3">Contact</th><th className="p-3">Assigned</th><th className="p-3" /></tr></thead>
            <tbody>{list.data.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="p-3 font-medium">{l.name ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{[l.email, l.phone].filter(Boolean).join(" · ") || "—"}</td>
                <td className="p-3">{formatDate(l.assigned_at)}</td>
                <td className="p-3 text-right"><Button variant="outline" size="sm" disabled={remove.isPending} onClick={() => { if (confirm(`Remove ${l.name ?? "this landlord"} from this property?`)) remove.mutate(l.id); }}>Remove</Button></td>
              </tr>))}</tbody>
          </table>
        </div>}
    </div>
  );
}
