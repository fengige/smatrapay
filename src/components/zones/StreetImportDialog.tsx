import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { importStreets, type StreetImportRowResult } from "@/lib/zones.functions";

type ParsedRow = { row: number; street_name: string; postal_code: string };

function parseCsv(text: string): { rows: ParsedRow[]; error?: string } {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return { rows: [], error: "The file is empty" };

  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const header = splitLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const nameIdx = header.indexOf("street_name");
  const postalIdx = header.indexOf("postal_code");
  if (nameIdx === -1) {
    return { rows: [], error: "Missing required column header “street_name”" };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitLine(lines[i] ?? "");
    rows.push({
      row: i + 1,
      street_name: cells[nameIdx] ?? "",
      postal_code: postalIdx === -1 ? "" : (cells[postalIdx] ?? ""),
    });
  }
  return { rows };
}

export function StreetImportDialog({
  routeId,
  routeCode,
  onClose,
  onImported,
}: {
  routeId: number;
  routeCode: string;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const runImport = useServerFn(importStreets);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [skipExisting, setSkipExisting] = useState(true);
  const [results, setResults] = useState<{
    results: StreetImportRowResult[];
    created: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      (await runImport({ data: { route_id: routeId, rows, skipExisting } } as never)) as {
        results: StreetImportRowResult[];
        created: number;
        skipped: number;
        failed: number;
      },
    onSuccess: async (res) => {
      setResults(res);
      if (res.created > 0) {
        toast.success(`${res.created} street${res.created === 1 ? "" : "s"} imported`);
        await onImported();
      } else {
        toast.warning("No streets were created — review the row errors below");
      }
    },
    onError: (e: Error) => toast.error(e.message || "Import failed"),
  });

  const downloadTemplate = () => {
    const csv = "street_name,postal_code\nMoi Avenue,00100\nKenyatta Avenue,00100\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "streets-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    setResults(null);
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    setParseError(parsed.error ?? null);
    setRows(parsed.rows);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="street-import-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-lg">
        <h2 id="street-import-title" className="text-lg font-bold">
          Import Streets to {routeCode}
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload a CSV with a <code>street_name</code> column and an optional{" "}
          <code>postal_code</code> column. Up to 1000 rows per import.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent/10">
            <Upload className="size-4" /> Choose CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
          </label>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <Download className="size-4" /> Download template
          </button>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={skipExisting}
            onChange={(e) => setSkipExisting(e.target.checked)}
          />
          Skip streets that already exist on this route (otherwise they are reported as errors)
        </label>

        {parseError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4" /> {parseError}
          </div>
        )}

        {!parseError && rows.length > 0 && !results && (
          <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Row</th>
                  <th className="px-3 py-2 text-left">Street name</th>
                  <th className="px-3 py-2 text-left">Postal code</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r) => (
                  <tr key={r.row} className="border-t border-border/70">
                    <td className="px-3 py-1.5 text-muted-foreground">{r.row}</td>
                    <td className="px-3 py-1.5">{r.street_name || "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.postal_code || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {results && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-600">
                <CheckCircle2 className="size-3.5" /> {results.created} created
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                {results.skipped} skipped
              </span>
              <span className="rounded-full bg-destructive/10 px-3 py-1 text-destructive">
                {results.failed} failed
              </span>
            </div>
            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Street</th>
                    <th className="px-3 py-2 text-left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.results.map((r) => (
                    <tr key={r.row} className="border-t border-border/70">
                      <td className="px-3 py-1.5 text-muted-foreground">{r.row}</td>
                      <td className="px-3 py-1.5">{r.street_name || "—"}</td>
                      <td
                        className={`px-3 py-1.5 ${
                          r.status === "failed"
                            ? "text-destructive"
                            : r.status === "created"
                              ? "text-emerald-600"
                              : "text-muted-foreground"
                        }`}
                      >
                        {r.status}
                        {r.message ? ` — ${r.message}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            {results ? "Close" : "Cancel"}
          </button>
          {!results && (
            <button
              type="button"
              disabled={!rows.length || Boolean(parseError) || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Import {rows.length || ""} row{rows.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
