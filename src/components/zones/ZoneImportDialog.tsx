import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { importZones, type ZoneImportRowResult } from "@/lib/zones.functions";

type ParsedRow = { row: number; zone_name: string; description: string };

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
  const nameIdx = header.indexOf("zone_name");
  const descIdx = header.indexOf("description");
  if (nameIdx === -1) {
    return { rows: [], error: "Missing required column header “zone_name”" };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitLine(lines[i] ?? "");
    rows.push({
      row: i + 1,
      zone_name: cells[nameIdx] ?? "",
      description: descIdx === -1 ? "" : (cells[descIdx] ?? ""),
    });
  }
  return { rows };
}

export function ZoneImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const runImport = useServerFn(importZones);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [skipExisting, setSkipExisting] = useState(true);
  const [results, setResults] = useState<{
    results: ZoneImportRowResult[];
    created: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      (await runImport({ data: { rows, skipExisting } } as never)) as {
        results: ZoneImportRowResult[];
        created: number;
        skipped: number;
        failed: number;
      },
    onSuccess: async (res) => {
      setResults(res);
      if (res.created > 0) {
        toast.success(`${res.created} zone${res.created === 1 ? "" : "s"} imported`);
        await onImported();
      } else {
        toast.warning("No zones were created — review the row errors below");
      }
    },
    onError: (e: Error) => toast.error(e.message || "Import failed"),
  });

  const downloadTemplate = () => {
    const csv = "zone_name,description\nNairobi Central,CBD service zone\nWestlands,Westlands area\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "zones-import-template.csv";
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
      aria-labelledby="zone-import-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-lg">
        <h2 id="zone-import-title" className="text-lg font-bold">
          Import Zones from CSV
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload a CSV with a <code>zone_name</code> column and an optional <code>description</code>{" "}
          column. Up to 1000 rows per import.
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
          Skip zones that already exist (otherwise they are reported as errors)
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
                  <th className="px-3 py-2 text-left">Zone name</th>
                  <th className="px-3 py-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r) => (
                  <tr key={r.row} className="border-t border-border/70">
                    <td className="px-3 py-1.5 text-muted-foreground">{r.row}</td>
                    <td className="px-3 py-1.5">{r.zone_name || "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.description || "—"}</td>
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
                    <th className="px-3 py-2 text-left">Zone</th>
                    <th className="px-3 py-2 text-left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.results.map((r) => (
                    <tr key={r.row} className="border-t border-border/70">
                      <td className="px-3 py-1.5 text-muted-foreground">{r.row}</td>
                      <td className="px-3 py-1.5">{r.zone_name || "—"}</td>
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
