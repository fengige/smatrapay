import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TokenHistoryPagination({ page, pageSize, total, busy, onPage, onPageSize }: {
  page: number; pageSize: number; total: number; busy: boolean;
  onPage: (page: number) => void; onPageSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label="Token history pagination" aria-busy={busy}
    className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-muted-foreground" role="status">{total === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`} of {total.toLocaleString()}</span>
      <label className="flex items-center gap-2">Page size
        <select aria-label="Token history page size" value={pageSize} disabled={busy}
          onChange={e => onPageSize(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-2 text-foreground">
          {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
    </div>
    <div className="flex items-center gap-3">
      {busy && <Loader2 aria-label="Loading token history" className="size-4 animate-spin text-muted-foreground" />}
      <Button variant="outline" size="icon" aria-label="Previous token history page" title="Previous page"
        disabled={busy || page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft /></Button>
      <span className="min-w-24 text-center">Page {page} of {pages}</span>
      <Button variant="outline" size="icon" aria-label="Next token history page" title="Next page"
        disabled={busy || page >= pages} onClick={() => onPage(page + 1)}><ChevronRight /></Button>
    </div>
  </nav>;
}