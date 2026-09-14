import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { getVendorScope, installationLabel } from "@/lib/vendor.functions";

export { installationLabel };

/** Shared vendor data source — always scoped to the signed-in vendor server-side. */
export function useVendorScope() {
  const fetchScope = useServerFn(getVendorScope);
  return useQuery({
    queryKey: ["vendor-scope"],
    queryFn: () => fetchScope(),
  });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const v = (value ?? "").toLowerCase();
  const tone =
    v === "active" || v === "installed" || v === "completed"
      ? "bg-emerald-500/12 text-emerald-600"
      : v === "failed" || v === "suspended"
        ? "bg-destructive/12 text-destructive"
        : v === "scheduled" || v === "pending" || v === "replaced"
          ? "bg-amber-500/12 text-amber-600"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${tone}`}>
      {value ? titleCase(value.replace(/_/g, " ")) : "—"}
    </span>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
      {message}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  onPage,
  total,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  total: number;
}) {
  if (pageCount <= 1) return <p className="px-1 py-3 text-xs text-muted-foreground">{total} records</p>;
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3 text-xs text-muted-foreground">
      <span>
        Page {page} of {pageCount} · {total} records
      </span>
      <span className="flex gap-2">
        <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button
          className="btn-outline px-3 py-1"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </span>
    </div>
  );
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const escape = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
