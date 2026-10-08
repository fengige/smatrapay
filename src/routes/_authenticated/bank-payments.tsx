import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Download, Loader2, RefreshCw, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import {
  exportBankPayments, retryNcbaPayment, runDueNcbaRetries, searchBankPayments,
  type BankSearch, type NcbaPaymentRow,
} from "@/lib/ncba.functions";
import { EXPORT_COLUMNS, exportFilename, toCsv } from "@/lib/bank-payments-export";

export const Route = createFileRoute("/_authenticated/bank-payments")({
  head: () => ({
    meta: [
      { title: "Bank Payments | SmatraPay Admin" },
      { name: "description", content: "NCBA and Sidian payments, failed token generation reasons, retries, search and export." },
      { property: "og:title", content: "Bank Payments | SmatraPay Admin" },
      { property: "og:description", content: "Review, search and export bank payments and retry token generation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BankPaymentsRoutePage,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
  retry_pending: { label: "Retry queued", cls: "bg-amber-500/15 text-amber-700" },
  needs_review: { label: "Needs review", cls: "bg-orange-500/15 text-orange-700" },
  processing: { label: "Processing", cls: "bg-secondary text-foreground" },
  completed: { label: "Completed", cls: "bg-emerald-500/15 text-emerald-700" },
};

const kes = (n: number) => `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Adv = { bank: string; transId: string; meter: string; mobile: string; name: string; rowStatus: string; minAmount: string; maxAmount: string; from: string; to: string; ownerName: string; ownerType: string };
const EMPTY: Adv = { bank: "", transId: "", meter: "", mobile: "", name: "", rowStatus: "", minAmount: "", maxAmount: "", from: "", to: "", ownerName: "", ownerType: "" };
const PAGE_SIZE = 50;

function toNum(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function BankPaymentsRoutePage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"problems" | "all" | "completed">("problems");
  const [quick, setQuick] = useState("");
  const [q, setQ] = useState("");
  const [advOpen, setAdvOpen] = useState(false);
  const [draft, setDraft] = useState<Adv>(EMPTY);
  const [adv, setAdv] = useState<Adv>(EMPTY);
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const search = useServerFn(searchBankPayments);
  const exportAll = useServerFn(exportBankPayments);
  const retry = useServerFn(retryNcbaPayment);
  const runDue = useServerFn(runDueNcbaRetries);
  const [confirm, setConfirm] = useState<NcbaPaymentRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(quick); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [quick]);

  const criteria: BankSearch = {
    status: filter, q, sortDir,
    bank: adv.bank, transId: adv.transId, meter: adv.meter, mobile: adv.mobile, name: adv.name, rowStatus: adv.rowStatus,
    minAmount: toNum(adv.minAmount), maxAmount: toNum(adv.maxAmount), from: adv.from, to: adv.to,
    ownerName: adv.ownerName, ownerType: (adv.ownerType || "all") as "all",
  };
  const activeCount = (Object.keys(EMPTY) as (keyof Adv)[]).filter((k) => adv[k].trim() !== "").length;

  const { data, isLoading, isFetching, refetch, isError } = useQuery({
    queryKey: ["bank-payments", criteria, page],
    queryFn: () => search({ data: { ...criteria, page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const retryMutation = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: (r) => {
      setConfirm(null);
      if (r.status === "completed") toast.success(r.message ?? "Token generated");
      else toast.error(r.message ?? "Retry failed");
      void qc.invalidateQueries({ queryKey: ["bank-payments"] });
    },
    onError: (e: Error) => toast.error(e.message || "Retry failed"),
  });

  const dueMutation = useMutation({
    mutationFn: () => runDue(),
    onSuccess: (r) => {
      toast.success(r.processed ? `Ran ${r.processed} queued retr${r.processed === 1 ? "y" : "ies"} · ${r.completed} completed` : "No queued retries are due");
      void qc.invalidateQueries({ queryKey: ["bank-payments"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not run queued retries"),
  });

  const applyFilters = () => {
    if (draft.minAmount && toNum(draft.minAmount) == null) { toast.error("Minimum amount must be a number"); return; }
    if (draft.maxAmount && toNum(draft.maxAmount) == null) { toast.error("Maximum amount must be a number"); return; }
    if (draft.from && draft.to && draft.from > draft.to) { toast.error("From date must be before To date"); return; }
    setAdv(draft); setPage(1); setAdvOpen(false);
  };
  const clearFilters = () => { setDraft(EMPTY); setAdv(EMPTY); setQuick(""); setQ(""); setPage(1); };

  const doExport = async (kind: "csv" | "xlsx" | "pdf") => {
    setExportOpen(false);
    setExporting(kind);
    try {
      const all = await exportAll({ data: criteria });
      if (!all.length) { toast.error("No payments match the current filters"); return; }
      const name = exportFilename(kind, adv.from, adv.to);
      if (kind === "csv") {
        const blob = new Blob(["\uFEFF" + toCsv(all)], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } else if (kind === "xlsx") {
        const { default: writeXlsxFile } = await import("write-excel-file/browser");
        const header = EXPORT_COLUMNS.map((c) => ({ value: c.header, fontWeight: "bold" as const }));
        const body = all.map((r) => EXPORT_COLUMNS.map((c) => {
          const v = c.value(r);
          return v == null ? null : typeof v === "number" ? { type: Number, value: v } : { type: String, value: String(v) };
        }));
        await writeXlsxFile([header, ...body] as never).toFile(name);
      } else {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
        doc.setFontSize(14);
        doc.text(`Bank Payments (${all.length})`, 30, 30);
        autoTable(doc, {
          startY: 42, styles: { fontSize: 6, cellPadding: 2 }, headStyles: { fontSize: 6 },
          head: [EXPORT_COLUMNS.map((c) => c.header)],
          body: all.map((r) => EXPORT_COLUMNS.map((c) => { const v = c.value(r); return v == null ? "—" : String(v); })),
        });
        doc.save(name);
      }
      toast.success(`Exported ${all.length} payment${all.length === 1 ? "" : "s"} to ${name}`);
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message || "please try again"}`);
    } finally {
      setExporting(null);
    }
  };

  const input = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";
  const field = (label: string, el: React.ReactNode) => (
    <label className="block text-xs font-medium text-muted-foreground">{label}<div className="mt-1">{el}</div></label>
  );

  return (
    <PortalLayout
      roles={["admin"]}
      title="Bank Payments"
      description="Payments received from NCBA and Sidian Bank, why a token failed, and retries"
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => dueMutation.mutate()} disabled={dueMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-60">
            {dueMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Run queued retries
          </button>
          <button type="button" onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10">
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="mb-4 flex gap-2">
        {([["problems", "Needs attention"], ["completed", "Completed"], ["all", "All"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setFilter(k); setPage(1); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === k ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick search: TransID, meter, mobile, name, bank…"
            aria-label="Quick search" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm" />
        </div>
        <button type="button" onClick={() => { setDraft(adv); setAdvOpen((o) => !o); }} aria-expanded={advOpen}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10">
          <SlidersHorizontal className="size-4" /> Advanced Search
          {!advOpen && activeCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{activeCount}</span>
          )}
        </button>
        <div className="relative">
          <button type="button" onClick={() => setExportOpen((o) => !o)} disabled={!!exporting} aria-haspopup="menu" aria-expanded={exportOpen}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-60">
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {exporting ? `Exporting ${exporting.toUpperCase()}…` : "Export"} <ChevronDown className="size-4" />
          </button>
          {exportOpen && (
            <div role="menu" className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              {([["csv", "Export CSV"], ["xlsx", "Export Excel"], ["pdf", "Export PDF"]] as const).map(([k, l]) => (
                <button key={k} role="menuitem" type="button" onClick={() => void doExport(k)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent/15">{l}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {advOpen && (
        <div className="mb-4 rounded-2xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {field("Bank", (
              <select className={input} value={draft.bank} onChange={(e) => setDraft({ ...draft, bank: e.target.value })}>
                <option value="">All banks</option>
                {(data?.bankOptions ?? []).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            ))}
            {field("TransID", <input className={input} value={draft.transId} onChange={(e) => setDraft({ ...draft, transId: e.target.value })} />)}
            {field("Meter", <input className={input} value={draft.meter} onChange={(e) => setDraft({ ...draft, meter: e.target.value })} />)}
            {field("Status", (
              <select className={input} value={draft.rowStatus} onChange={(e) => setDraft({ ...draft, rowStatus: e.target.value })}>
                <option value="">Any status</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            ))}
            {field("Minimum Amount", <input className={input} inputMode="decimal" type="number" step="0.01" value={draft.minAmount} onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })} />)}
            {field("Maximum Amount", <input className={input} inputMode="decimal" type="number" step="0.01" value={draft.maxAmount} onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })} />)}
            {field("From Date", <input className={input} type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />)}
            {field("To Date", <input className={input} type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />)}
            {field("Mobile / Phone", <input className={input} value={draft.mobile} onChange={(e) => setDraft({ ...draft, mobile: e.target.value })} />)}
            {field("Owner Name", <input className={input} value={draft.ownerName} onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })} />)}
            {field("Owner Type", (
              <select className={input} value={draft.ownerType} onChange={(e) => setDraft({ ...draft, ownerType: e.target.value })}>
                <option value="">All</option><option value="vendor">Vendor</option><option value="landlord">Landlord</option><option value="agent">Agent</option>
              </select>
            ))}
            {field("Customer Name", <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />)}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={clearFilters} className="rounded-lg border border-border px-3.5 py-2 text-sm">Clear Filters</button>
            <button type="button" onClick={applyFilters} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">Apply Filters</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Bank</th>
                <th className="px-4 py-3">TransID</th>
                <th className="px-4 py-3">Meter</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => { setSortDir((d) => (d === "desc" ? "asc" : "desc")); setPage(1); }}
                    className="inline-flex items-center gap-1 uppercase">
                    Received {sortDir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
                  </button>
                </th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={10} className="px-4 py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
              )}
              {isError && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-destructive">Could not load bank payments.</td></tr>
              )}
              {!isLoading && !isError && rows.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                  {q || activeCount ? "No payments match your search." : filter === "problems" ? "No bank payments need attention." : "No bank payments yet."}
                </td></tr>
              )}
              {rows.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, cls: "bg-secondary" };
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-semibold">{r.bank || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.trans_id || "—"}</td>
                    <td className="px-4 py-3">{r.meter_number || "—"}</td>
                    <td className="px-4 py-3">
                      {r.owner_type ? (<><span className="block font-medium">{r.owner_name || "—"}</span><span className="block text-xs text-muted-foreground">{r.owner_type}</span></>) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{kes(r.trans_amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                      {r.status === "retry_pending" && r.next_retry_at && (
                        <span className="mt-1 block text-xs text-muted-foreground">Next: {new Date(r.next_retry_at).toLocaleTimeString()}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {r.status === "completed" ? (
                        <span className="text-xs text-muted-foreground">Token {r.token ?? "—"} · SMS: {r.sms_status ?? "—"}</span>
                      ) : (
                        <>
                          <span className="block">{r.error_message ?? "—"}</span>
                          {r.status === "needs_review" && (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              The vending service didn't answer, so a token may already exist. Check with the provider before retrying.
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.attempts} total · {r.auto_retry_count} automatic</td>
                    <td className="px-4 py-3 text-right">
                      {r.status !== "completed" && r.status !== "processing" && (
                        <button type="button" onClick={() => setConfirm(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                          <RotateCcw className="size-3.5" /> Retry
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">{total.toLocaleString()} payment{total === 1 ? "" : "s"} · page {page} of {pages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50">Previous</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div role="dialog" aria-modal="true" aria-label="Confirm retry" className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-bold">Retry token generation?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {kes(confirm.trans_amount)} for meter {confirm.meter_number ?? confirm.narrative} ({confirm.bank ?? "NCBA"} {confirm.trans_id}). This sends a real token request to the meter's vending software.
            </p>
            {confirm.status === "needs_review" && (
              <p className="mt-2 text-sm font-medium text-destructive">
                The last attempt timed out. Only retry after confirming with the provider that no token was issued.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} disabled={retryMutation.isPending}
                className="rounded-lg border border-border px-3.5 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => retryMutation.mutate(confirm.id)} disabled={retryMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {retryMutation.isPending && <Loader2 className="size-4 animate-spin" />} Retry now
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
