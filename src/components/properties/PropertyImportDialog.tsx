import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import {
  importProperties,
  type PropertyImportResult,
  type PropertyImportRow,
} from "@/lib/properties.functions";

const HEADERS = [
  "name",
  "code",
  "property_type",
  "building_category",
  "subtype",
  "number_of_units",
  "zone_name",
  "route_code",
  "street_name",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "country",
  "postal_code",
  "status",
] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length));
}

function toRows(text: string): { rows: PropertyImportRow[]; error?: string } {
  const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!parsed.length) return { rows: [], error: "The file is empty" };
  const header = parsed[0]!.map((h) => h.trim().toLowerCase());
  if (!header.includes("name") || !header.includes("property_type")) {
    return { rows: [], error: "CSV must include at least 'name' and 'property_type' columns" };
  }
  const rows = parsed.slice(1).map((cells, index) => {
    const get = (key: string) => {
      const at = header.indexOf(key);
      return at === -1 ? "" : (cells[at] ?? "").trim();
    };
    return {
      row: index + 2,
      name: get("name"),
      code: get("code"),
      property_type: get("property_type"),
      building_category: get("building_category"),
      subtype: get("subtype"),
      number_of_units: get("number_of_units"),
      zone_name: get("zone_name"),
      route_code: get("route_code"),
      street_name: get("street_name"),
      address_line1: get("address_line1"),
      address_line2: get("address_line2"),
      city: get("city"),
      state: get("state"),
      country: get("country"),
      postal_code: get("postal_code"),
      status: get("status"),
    } satisfies PropertyImportRow;
  });
  if (rows.length > 1000) return { rows: [], error: "A maximum of 1000 rows can be imported at once" };
  return { rows };
}

function downloadTemplate() {
  const sample = [
    HEADERS.join(","),
    "Riverside Court,RC-01,building,residential,Apartment,12,,,,12 Riverside Drive,,Nairobi,Nairobi,Kenya,00100,active",
    "Kilimani Zone Cluster,,zone,,,0,Kilimani,RT-001,Argwings Kodhek Road,,,Nairobi,Nairobi,Kenya,00100,active",
  ].join("\n");
  const blob = new Blob([`\uFEFF${sample}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "smatrapay-properties-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function PropertyImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const runImport = useServerFn(importProperties);
  const [rows, setRows] = useState<PropertyImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);
  const [results, setResults] = useState<PropertyImportResult[] | null>(null);
  const [validated, setValidated] = useState(false);

  const reset = () => {
    setRows([]);
    setFileName("");
    setResults(null);
    setValidated(false);
  };

  const mutation = useMutation({
    mutationFn: (dryRun: boolean) => runImport({ data: { rows, skipExisting, dryRun } }),
    onSuccess: (res, dryRun) => {
      setResults(res.results);
      setValidated(dryRun);
      if (dryRun) {
        toast.message(`Validation complete: ${res.created} ready, ${res.skipped} skipped, ${res.failed} with errors`);
      } else {
        if (res.created) toast.success(`${res.created} propert${res.created === 1 ? "y" : "ies"} imported`);
        if (res.failed) toast.error(`${res.failed} row(s) could not be imported`);
        onImported();
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!open) return null;

  const failed = results?.filter((r) => r.status === "failed") ?? [];
  const ok = results?.filter((r) => r.status === "created") ?? [];
  const skipped = results?.filter((r) => r.status === "skipped") ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Import properties from CSV</h2>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            aria-label="Close import dialog"
            className="rounded-lg border border-border p-1.5 hover:bg-accent/10"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          Zone properties must reference an existing zone and route (street optional); each row is
          validated against those relationships before anything is saved.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <Download className="size-4" /> Download template
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10">
            <Upload className="size-4" /> Choose CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                const parsed = toRows(text);
                if (parsed.error) {
                  toast.error(parsed.error);
                  return;
                }
                setRows(parsed.rows);
                setFileName(file.name);
                setResults(null);
                setValidated(false);
              }}
            />
          </label>
          {fileName && (
            <span className="text-sm text-muted-foreground">
              {fileName} · {rows.length} row{rows.length === 1 ? "" : "s"}
            </span>
          )}
          <label className="ml-auto inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={(e) => setSkipExisting(e.target.checked)}
            />
            Skip rows whose property name already exists
          </label>
        </div>

        {results && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-600">
                {validated ? "Ready" : "Imported"}: {ok.length}
              </span>
              <span className="rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground">
                Skipped: {skipped.length}
              </span>
              <span className="rounded-full bg-destructive/10 px-3 py-1 font-semibold text-destructive">
                Errors: {failed.length}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Property</th>
                    <th className="px-3 py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={`${r.row}-${r.name}`} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground">{r.row}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1.5 ${
                            r.status === "failed"
                              ? "text-destructive"
                              : r.status === "skipped"
                                ? "text-muted-foreground"
                                : "text-emerald-600"
                          }`}
                        >
                          {r.status === "failed" ? (
                            <AlertTriangle className="size-3.5" />
                          ) : (
                            <CheckCircle2 className="size-3.5" />
                          )}
                          {r.message}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!rows.length || mutation.isPending}
            onClick={() => mutation.mutate(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-accent/10 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />} Validate rows
          </button>
          <button
            type="button"
            disabled={!rows.length || mutation.isPending}
            onClick={() => mutation.mutate(false)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />} Import{" "}
            {rows.length ? `${rows.length} row${rows.length === 1 ? "" : "s"}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
