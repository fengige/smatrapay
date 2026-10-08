import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Eye, EyeOff, Loader2, MessageSquare, RefreshCw, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { exportTransactionRecords, listTransactionRecords, type TxnRecord, type TxnSearch } from "@/lib/transaction-records.functions";
import { retryNcbaPayment } from "@/lib/ncba.functions";
import { resendTokenSms } from "@/lib/tokens.functions";

export const Route = createFileRoute("/_authenticated/transaction-records")({
  head: () => ({
    meta: [
      { title: "Transaction Records | SmatraPay Admin" },
      { name: "description", content: "Daily history of every prepaid meter token transaction across banks and vending software." },
      { property: "og:title", content: "Transaction Records | SmatraPay Admin" },
      { property: "og:description", content: "Search, filter and export daily prepaid token transactions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionRecordsPage,
});

/** Today's date in Nairobi (UTC+3). */
const nairobiToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

const kes = (n: number | null) => (n == null ? "—" : `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const units = (n: number | null) => (n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 4 }));
const cap = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—");
const maskToken = (t: string) => { const d = t.replace(/\D/g, ""); return d.length > 8 ? `${d.slice(0, 4)} •••• •••• ${d.slice(-4)}` : "••••"; };

const TOKEN_ST: Record<string, string> = {
  generated: "bg-emerald-500/15 text-emerald-700", failed: "bg-destructive/10 text-destructive",
  pending: "bg-amber-500/15 text-amber-700", revoked: "bg-secondary text-foreground", expired: "bg-secondary text-muted-foreground",
};
const tokenLabel = (r: TxnRecord) =>
  r.token_status === "failed" && r.payment_status === "received" ? "Payment Received - Token Generation Failed"
  : r.token_status === "pending" ? "Token Generation Pending"
  : r.token_status === "generated" ? "Token Generated" : cap(r.token_status);

type Adv = { from: string; to: string; bank: string; transId: string; meter: string; owner: string; ownerType: string; software: string; tokenStatus: string; paymentStatus: string; smsStatus: string; minAmount: string; maxAmount: string };
const EMPTY: Adv = { from: "", to: "", bank: "", transId: "", meter: "", owner: "", ownerType: "", software: "", tokenStatus: "", paymentStatus: "", smsStatus: "", minAmount: "", maxAmount: "" };
const toNum = (s: string) => { if (!s.trim()) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

const EXPORT_COLS: [string, (r: TxnRecord) => string | number | null][] = [
  ["Date/Time", (r) => new Date(r.txn_at).toLocaleString()], ["Bank", (r) => r.bank], ["TransID", (r) => r.trans_id],
  ["Meter", (r) => r.meter_number], ["Owner", (r) => r.owner_name], ["Owner Type", (r) => (r.owner_type ? cap(r.owner_type) : null)],
  ["Amount Paid", (r) => r.amount_paid], ["Commission", (r) => r.commission_amount], ["VAT on Commission", (r) => r.vat_on_commission_amount],
  ["Tokenizable Amount", (r) => r.tokenizable_amount], ["Units", (r) => r.units], ["Tariff", (r) => r.tariff],
  ["Vending Software", (r) => r.vending_software], ["Token Status", (r) => tokenLabel(r)], ["Payment Status", (r) => cap(r.payment_status)],
  ["SMS Status", (r) => cap(r.sms_status)],
];

function TransactionRecordsPage() {
  const qc = useQueryClient();
  const [day, setDay] = useState(nairobiToday);
  const [quick, setQuick] = useState("");
  const [q, setQ] = useState("");
  const [advOpen, setAdvOpen] = useState(false);
  const [draft, setDraft] = useState<Adv>(EMPTY);
  const [adv, setAdv] = useState<Adv>(EMPTY);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<NonNullable<TxnSearch["sort"]>>("txn_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [detail, setDetail] = useState<TxnRecord | null>(null);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [confirmRetry, setConfirmRetry] = useState<TxnRecord | null>(null);

  const list = useServerFn(listTransactionRecords);
  const exportAll = useServerFn(exportTransactionRecords);
  const retry = useServerFn(retryNcbaPayment);
  const resend = useServerFn(resendTokenSms);

  useEffect(() => { const t = setTimeout(() => { setQ(quick); setPage(1); }, 300); return () => clearTimeout(t); }, [quick]);

  const rangeActive = !!(adv.from || adv.to);
  const criteria: TxnSearch = {
    from: adv.from || (adv.to ? adv.to : day), to: adv.to || (adv.from ? nairobiToday() : day),
    q, bank: adv.bank, transId: adv.transId, meter: adv.meter, owner: adv.owner,
    ownerType: (adv.ownerType || "all") as "all", software: adv.software, tokenStatus: adv.tokenStatus,
    paymentStatus: adv.paymentStatus, smsStatus: adv.smsStatus, minAmount: toNum(adv.minAmount), maxAmount: toNum(adv.maxAmount), sort, dir,
  };
  const activeCount = (Object.keys(EMPTY) as (keyof Adv)[]).filter((k) => adv[k].trim() !== "").length;

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["transaction-records", criteria, page, pageSize],
    queryFn: () => list({ data: { ...criteria, page, pageSize } }),
    placeholderData: keepPreviousData,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const s = data?.summary;

  const retryM = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: (r) => { setConfirmRetry(null); setDetail(null); if (r.status === "completed") toast.success(r.message ?? "Token generated"); else toast.error(r.message ?? "Retry failed"); void qc.invalidateQueries({ queryKey: ["transaction-records"] }); },
    onError: (e: Error) => toast.error(e.message || "Retry failed"),
  });
  const resendM = useMutation({
    mutationFn: (id: string) => resend({ data: { id } }),
    onSuccess: () => { toast.success("Token SMS submitted"); void qc.invalidateQueries({ queryKey: ["transaction-records"] }); },
    onError: (e: Error) => toast.error(e.message || "Could not resend SMS"),
  });

  const toggleSort = (k: NonNullable<TxnSearch["sort"]>) => {
    if (sort === k) setDir((d) => (d === "desc" ? "asc" : "desc")); else { setSort(k); setDir("desc"); }
    setPage(1);
  };
  const changeDay = (d: string) => { setDay(d); setPage(1); };
  const applyFilters = () => {
    if ((draft.minAmount && toNum(draft.minAmount) == null) || (draft.maxAmount && toNum(draft.maxAmount) == null)) { toast.error("Amounts must be numbers"); return; }
    if (draft.from && draft.to && draft.from > draft.to) { toast.error("Date From must be before Date To"); return; }
    setAdv(draft); setPage(1); setAdvOpen(false);
  };
  const clearFilters = () => { setDraft(EMPTY); setAdv(EMPTY); setQuick(""); setQ(""); setPage(1); };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success("Token copied"); } catch { toast.error("Could not copy"); } };
  const canRetry = (r: TxnRecord) => !r.token_id && !!r.bank_notification_id && r.payment_status !== "processing" && (r.token_status === "failed" || r.token_status === "pending");

  const doExport = async (kind: "csv" | "xlsx" | "pdf") => {
    setExportOpen(false); setExporting(kind);
    try {
      const all = await exportAll({ data: criteria });
      if (!all.length) { toast.error("No transactions match the current filters"); return; }
      const name = criteria.from === criteria.to ? `transaction-records-${criteria.from}.${kind}` : `transaction-records-${criteria.from}_to_${criteria.to}.${kind}`;
      if (kind === "csv") {
        const esc = (v: unknown) => { const x = v == null ? "" : String(v); const safe = /^[=+\-@]/.test(x) && !/^-?\d/.test(x) ? `'${x}` : x; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
        const csv = [EXPORT_COLS.map(([h]) => esc(h)).join(","), ...all.map((r) => EXPORT_COLS.map(([, f]) => esc(f(r))).join(","))].join("\r\n");
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })); a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } else if (kind === "xlsx") {
        const { default: writeXlsxFile } = await import("write-excel-file/browser");
        const header = EXPORT_COLS.map(([h]) => ({ value: h, fontWeight: "bold" as const }));
        const body = all.map((r) => EXPORT_COLS.map(([, f]) => { const v = f(r); return v == null ? null : typeof v === "number" ? { type: Number, value: v } : { type: String, value: String(v) }; }));
        await writeXlsxFile([header, ...body] as never).toFile(name);
      } else {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
        doc.setFontSize(14); doc.text(`Transaction Records ${criteria.from}${criteria.to !== criteria.from ? ` to ${criteria.to}` : ""} (${all.length})`, 30, 30);
        autoTable(doc, { startY: 42, styles: { fontSize: 6, cellPadding: 2 }, head: [EXPORT_COLS.map(([h]) => h)], body: all.map((r) => EXPORT_COLS.map(([, f]) => { const v = f(r); return v == null ? "—" : String(v); })) });
        doc.save(name);
      }
      toast.success(`Exported ${all.length} transaction${all.length === 1 ? "" : "s"} to ${name}`);
    } catch (e) { toast.error(`Export failed: ${(e as Error).message || "please try again"}`); }
    finally { setExporting(null); }
  };

  const input = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";
  const field = (label: string, el: React.ReactNode) => <label className="block text-xs font-medium text-muted-foreground">{label}<div className="mt-1">{el}</div></label>;
  const sel = (k: keyof Adv, opts: [string, string][], all = "All") => (
    <select className={input} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}>
      <option value="">{all}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const Th = ({ k, label, right }: { k?: NonNullable<TxnSearch["sort"]>; label: string; right?: boolean }) => (
    <th className={`px-3 py-2.5 whitespace-nowrap ${right ? "text-right" : ""}`}>
      {k ? (
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase">
          {label}{sort === k && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
        </button>
      ) : label}
    </th>
  );

  const cards: [string, string][] = s ? [
    ["Total Transactions", s.total.toLocaleString()], ["Successful", s.successful.toLocaleString()], ["Failed", s.failed.toLocaleString()],
    ["Total Amount Paid", kes(s.amount_paid)], ["Total Commission", kes(s.commission)], ["Total VAT on Commission", kes(s.vat)],
    ["Total Units", units(s.units)], ["Tokens Generated", s.tokens.toLocaleString()],
  ] : [];

  return (
    <PortalLayout roles={["admin"]} title="Transaction Records" description="Daily history of every prepaid meter token transaction"
      actions={
        <button type="button" onClick={() => refetch()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10">
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      }>
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4">
        <label className="text-xs font-medium text-muted-foreground">Transaction Date
          <input type="date" value={day} max={nairobiToday()} disabled={rangeActive} onChange={(e) => e.target.value && changeDay(e.target.value)}
            className="mt-1 block h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground disabled:opacity-50" />
        </label>
        <button type="button" disabled={rangeActive} onClick={() => changeDay(shiftDay(day, -1))} className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm disabled:opacity-50"><ChevronLeft className="size-4" /> Previous Day</button>
        <button type="button" disabled={rangeActive || day === nairobiToday()} onClick={() => changeDay(nairobiToday())} className="h-10 rounded-lg border border-border px-3 text-sm disabled:opacity-50">Today</button>
        <button type="button" disabled={rangeActive || day >= nairobiToday()} onClick={() => changeDay(shiftDay(day, 1))} className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm disabled:opacity-50">Next Day <ChevronRight className="size-4" /></button>
        {rangeActive && <span className="text-xs text-muted-foreground">Showing the Advanced Search date range {criteria.from} to {criteria.to}.</span>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(cards.length ? cards : Array.from({ length: 8 }, () => ["…", "…"] as [string, string])).map(([l, v], i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick search: meter, TransID, owner, token, bank…" aria-label="Quick search"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm" />
        </div>
        <button type="button" onClick={() => { setDraft(adv); setAdvOpen((o) => !o); }} aria-expanded={advOpen}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10">
          <SlidersHorizontal className="size-4" /> Advanced Search
          {!advOpen && activeCount > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{activeCount}</span>}
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
                <button key={k} role="menuitem" type="button" onClick={() => void doExport(k)} className="block w-full px-3 py-2 text-left text-sm hover:bg-accent/15">{l}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {advOpen && (
        <div className="mb-4 rounded-2xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {field("Date From", <input type="date" className={input} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />)}
            {field("Date To", <input type="date" className={input} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />)}
            {field("Bank", sel("bank", (data?.bankOptions ?? []).map((b) => [b, b]), "All banks"))}
            {field("TransID", <input className={input} value={draft.transId} onChange={(e) => setDraft({ ...draft, transId: e.target.value })} />)}
            {field("Meter Number", <input className={input} value={draft.meter} onChange={(e) => setDraft({ ...draft, meter: e.target.value })} />)}
            {field("Owner", <input className={input} value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} />)}
            {field("Owner Type", sel("ownerType", [["vendor", "Vendor"], ["landlord", "Landlord"], ["agent", "Agent"]]))}
            {field("Vending Software", sel("software", (data?.softwareOptions ?? []).map((v: string) => [v, v])))}
            {field("Token Status", sel("tokenStatus", [["generated", "Generated"], ["failed", "Failed"], ["pending", "Pending"], ["revoked", "Revoked"], ["expired", "Expired"]]))}
            {field("Payment Status", sel("paymentStatus", [["completed", "Completed"], ["received", "Received"], ["processing", "Processing"]]))}
            {field("SMS Status", sel("smsStatus", [["sent", "Sent"], ["queued", "Queued"], ["failed", "Failed"], ["not_sent", "Not Sent"], ["not_applicable", "Not Applicable"]]))}
            <div className="grid grid-cols-2 gap-2">
              {field("Minimum Amount", <input type="number" step="0.01" className={input} value={draft.minAmount} onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })} />)}
              {field("Maximum Amount", <input type="number" step="0.01" className={input} value={draft.maxAmount} onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })} />)}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={clearFilters} className="rounded-lg border border-border px-3.5 py-2 text-sm">Clear Filters</button>
            <button type="button" onClick={applyFilters} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">Apply Filters</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[110rem] text-xs">
            <thead className="bg-secondary/60 text-left uppercase tracking-wide text-muted-foreground">
              <tr>
                <Th k="txn_at" label="Date/Time" /><Th k="bank" label="Bank" /><Th k="trans_id" label="TransID" /><Th k="meter_number" label="Meter" />
                <Th k="owner_name" label="Owner" /><Th label="Owner Type" /><Th k="amount_paid" label="Amount Paid" right /><Th label="Commission" right />
                <Th label="VAT on Comm." right /><Th label="Tokenizable" right /><Th k="units" label="Units" right /><Th label="Tariff" right />
                <Th label="Vending Software" /><Th label="Token" /><Th k="token_status" label="Token Status" /><Th label="SMS" /><Th k="payment_status" label="Payment" /><Th label="Actions" right />
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={18} className="px-4 py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>}
              {isError && <tr><td colSpan={18} className="px-4 py-10 text-center text-destructive">Could not load transactions. {(error as Error)?.message}</td></tr>}
              {!isLoading && !isError && rows.length === 0 && <tr><td colSpan={18} className="px-4 py-10 text-center text-muted-foreground">No transactions for this selection.</td></tr>}
              {rows.map((r: TxnRecord) => (
                <tr key={r.record_id} className="border-t border-border align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.txn_at).toLocaleString()}</td>
                  <td className="px-3 py-2 font-semibold">{r.bank || "—"}</td>
                  <td className="px-3 py-2 font-mono">{r.trans_id || "—"}</td>
                  <td className="px-3 py-2 font-mono">{r.meter_number || "—"}</td>
                  <td className="px-3 py-2">{r.owner_name || "—"}</td>
                  <td className="px-3 py-2">{r.owner_type ? cap(r.owner_type) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{kes(r.amount_paid)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{kes(r.commission_amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{kes(r.vat_on_commission_amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{kes(r.tokenizable_amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{units(r.units)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.tariff == null ? "—" : `${kes(r.tariff)}/unit`}</td>
                  <td className="px-3 py-2">{r.vending_software || "—"}</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">
                    {r.token ? (
                      <span className="inline-flex items-center gap-1">
                        {shown[r.record_id] ? r.token : maskToken(r.token)}
                        <button type="button" aria-label={shown[r.record_id] ? "Hide token" : "View token"} onClick={() => setShown((x) => ({ ...x, [r.record_id]: !x[r.record_id] }))}>
                          {shown[r.record_id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                        <button type="button" aria-label="Copy token" onClick={() => void copy(r.token!)}><Copy className="size-3.5" /></button>
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 font-semibold ${TOKEN_ST[r.token_status] ?? "bg-secondary"}`}>{tokenLabel(r)}</span></td>
                  <td className="px-3 py-2">{cap(r.sms_status)}</td>
                  <td className="px-3 py-2">{r.payment_status === "received" ? "Payment Received" : cap(r.payment_status)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setDetail(r)} className="rounded-lg border border-border px-2 py-1 font-medium">Details</button>
                    {r.token_id && r.token_status === "generated" && (
                      <button type="button" disabled={resendM.isPending} onClick={() => resendM.mutate(r.token_id!)} aria-label="Resend token SMS" className="ml-1 rounded-lg border border-border px-2 py-1"><MessageSquare className="inline size-3.5" /></button>
                    )}
                    {canRetry(r) && (
                      <button type="button" onClick={() => setConfirmRetry(r)} className="ml-1 rounded-lg bg-primary px-2 py-1 font-semibold text-primary-foreground"><RotateCcw className="inline size-3.5" /> Retry</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">{total.toLocaleString()} record{total === 1 ? "" : "s"} · page {page} of {pages}</span>
          <div className="flex items-center gap-2">
            <select aria-label="Page size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-9 rounded-lg border border-border bg-background px-2">
              {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50">Previous</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setDetail(null)}>
          <div role="dialog" aria-modal="true" aria-label="Transaction details" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-bold">Transaction Details</h2>
            {([
              ["Transaction Information", [["Transaction ID", detail.record_id], ["Bank", detail.bank ?? "—"], ["Bank Reference / TransID", detail.trans_id ?? "—"], ["Transaction Date", new Date(detail.txn_at).toLocaleString()], ["Payment Status", detail.payment_status === "received" ? "Payment Received" : cap(detail.payment_status)]]],
              ["Meter Information", [["Meter Number", detail.meter_number ?? "—"], ["Meter Owner", detail.owner_name ?? "—"], ["Owner Type", cap(detail.owner_type)], ["Vending Software", detail.vending_software ?? "—"]]],
              ["Payment Information", [["Amount Paid", kes(detail.amount_paid)], ["Commission", kes(detail.commission_amount)], ["VAT on Commission", kes(detail.vat_on_commission_amount)], ["Tokenizable Amount", kes(detail.tokenizable_amount)]]],
              ["Token Information", [["Action", cap(detail.action)], ["Units", units(detail.units)], ["Tariff", detail.tariff == null ? "—" : `${kes(detail.tariff)}/unit`], ["Token", detail.token ? maskToken(detail.token) : "—"], ["Token Status", tokenLabel(detail)], ["Provider Transaction Reference", detail.provider_reference ?? "—"], ...(detail.error_message && detail.token_status !== "generated" ? [["Failure Reason", detail.error_message] as [string, string]] : [])]],
              ["SMS Information", [["Recipient Mobile Number", detail.mobile ?? "—"], ["SMS Status", cap(detail.sms_status)], ["SMS Provider", "Meter owner's SMS configuration"], ["SMS Sent Date/Time", detail.sms_at ? new Date(detail.sms_at).toLocaleString() : "—"]]],
            ] as [string, [string, string][]][]).map(([h, items]) => (
              <section key={h} className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</h3>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  {items.map(([k, v]) => <div key={k} className="flex justify-between gap-2 border-b border-border/60 py-1"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium break-all">{v}</dd></div>)}
                </dl>
              </section>
            ))}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {detail.token && <button type="button" onClick={() => void copy(detail.token!)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm"><Copy className="size-4" /> Copy Token</button>}
              {detail.token_id && detail.token_status === "generated" && <button type="button" disabled={resendM.isPending} onClick={() => resendM.mutate(detail.token_id!)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm"><MessageSquare className="size-4" /> Resend Token SMS</button>}
              {canRetry(detail) && <button type="button" onClick={() => setConfirmRetry(detail)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground"><RotateCcw className="size-4" /> Retry Token Generation</button>}
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg border border-border px-3.5 py-2 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {confirmRetry && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div role="dialog" aria-modal="true" aria-label="Confirm retry" className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-bold">Retry token generation?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {kes(confirmRetry.amount_paid)} for meter {confirmRetry.meter_number ?? "—"} ({confirmRetry.bank} {confirmRetry.trans_id}). The customer is not charged again, and a payment that already has a token is never vended twice.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmRetry(null)} disabled={retryM.isPending} className="rounded-lg border border-border px-3.5 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => retryM.mutate(confirmRetry.bank_notification_id!)} disabled={retryM.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {retryM.isPending && <Loader2 className="size-4 animate-spin" />} Retry now
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
