import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Loader2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  bulkAddMeters,
  listBulkMeterOptions,
  type BulkAddResult,
} from "@/lib/meters.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/meters/bulk-add")({
  head: () => ({
    meta: [
      { title: "Add Meters · SmatraPay" },
      {
        name: "description",
        content:
          "Register many electricity, water or gas meters at once against a supplier and a vendor, landlord or agent.",
      },
      { property: "og:title", content: "Add Meters · SmatraPay" },
      {
        property: "og:description",
        content: "Create multiple meters in a single validated bulk operation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BulkAddMetersPage,
});

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9/_-]*$/;
const TEMPLATE_HEADERS = ["meter_number", "serial_no", "sgc", "krn", "ti", "ea", "ken"] as const;

function identifierError(label: string, value: string) {
  const v = value.trim();
  if (!v) return `${label} is required`;
  if (v.length < 4) return `${label} must be at least 4 characters`;
  if (v.length > 64) return `${label} must be 64 characters or less`;
  if (!IDENTIFIER_RE.test(v)) return `${label} may only contain letters, numbers, - _ /`;
  return null;
}

function numberError(label: string, value: string) {
  const v = value.trim();
  if (!v) return `${label} is required`;
  if (!/^\d+$/.test(v)) return `${label} must be a whole number`;
  return null;
}

type Row = {
  meter_number: string;
  serial_number: string;
  sgc: string;
  krn: string;
  ti: string;
  ea: string;
  ken: string;
};

const emptyRow = (): Row => ({
  meter_number: "",
  serial_number: "",
  sgc: "",
  krn: "",
  ti: "",
  ea: "",
  ken: "",
});

type RowErrors = Partial<Record<keyof Row, string>>;
type DuplicateMode = "reject" | "skip" | "update";

function BulkAddMetersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadOptions = useServerFn(listBulkMeterOptions);
  const bulkCreate = useServerFn(bulkAddMeters);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["bulk-meter-options"],
    queryFn: () => loadOptions({} as never),
  });

  const suppliers = data?.suppliers ?? [];
  const vendors = data?.vendors ?? [];
  const landlords = data?.landlords ?? [];
  const agents = data?.agents ?? [];

  const [meterType, setMeterType] = useState<"electricity" | "water" | "gas" | "">("");
  const [supplierId, setSupplierId] = useState("");
  const [ownerType, setOwnerType] = useState<"" | "vendor" | "landlord" | "agent">("");
  const [ownerId, setOwnerId] = useState("");
  const [count, setCount] = useState("1");
  const [rows, setRows] = useState<Row[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("reject");
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [review, setReview] = useState(false);
  const [result, setResult] = useState<BulkAddResult | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setOwnerId("");
  }, [ownerType]);

  useEffect(() => {
    if (duplicateMode !== "update") setConfirmUpdate(false);
  }, [duplicateMode]);

  const ownerOptions =
    ownerType === "vendor"
      ? vendors
      : ownerType === "landlord"
        ? landlords
        : ownerType === "agent"
          ? agents
          : [];

  const generateRows = () => {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1) {
      toast.error("Enter a whole number of meters (minimum 1)");
      return;
    }
    const size = Math.min(500, n);
    setRows((prev) => Array.from({ length: size }, (_, i) => prev[i] ?? emptyRow()));
  };

  const setRow = (i: number, key: keyof Row, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  /* ------------------------------ CSV template ------------------------------ */

  const downloadTemplate = () => {
    const sample = ["MTR-000001", "SRL-000001", "123456", "1", "0", "1", "9"];
    const csv = [TEMPLATE_HEADERS.join(","), sample.join(",")].join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "smatrapay-add-meters-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onTemplateFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((l) => l.trim());
      if (lines.length < 2) {
        toast.error("The CSV has no data rows");
        return;
      }
      const split = (line: string) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const header = split(lines[0]!).map((h) => h.toLowerCase());
      const idx = (name: string) => header.indexOf(name);
      const cols = {
        meter_number: idx("meter_number"),
        serial: idx("serial_no") >= 0 ? idx("serial_no") : idx("serial_number"),
        sgc: idx("sgc"),
        krn: idx("krn"),
        ti: idx("ti"),
        ea: idx("ea"),
        ken: idx("ken"),
      };
      if (cols.meter_number < 0) {
        toast.error("CSV must include a meter_number column");
        return;
      }
      const parsed: Row[] = lines.slice(1, 501).map((line) => {
        const c = split(line);
        const get = (i: number) => (i >= 0 ? (c[i] ?? "") : "");
        return {
          meter_number: get(cols.meter_number),
          serial_number: get(cols.serial),
          sgc: get(cols.sgc),
          krn: get(cols.krn),
          ti: get(cols.ti),
          ea: get(cols.ea),
          ken: get(cols.ken),
        };
      });
      setRows(parsed);
      setCount(String(parsed.length));
      toast.success(`${parsed.length} row${parsed.length === 1 ? "" : "s"} loaded from CSV`);
    } finally {
      setImporting(false);
    }
  };

  /* ------------------------------ validation ------------------------------ */

  const headerErrors = useMemo(
    () => ({
      meterType: meterType ? null : "Select a meter type",
      supplierId: supplierId ? null : "Select a supplier",
      ownerType: ownerType ? null : "Select a user type",
      ownerId: ownerId ? null : "Select a user",
      count: numberError("No. of meters", count) ?? (Number(count) < 1 ? "Minimum is 1" : null),
    }),
    [meterType, supplierId, ownerType, ownerId, count],
  );

  const rowErrors: RowErrors[] = useMemo(
    () =>
      rows.map((r, i) => {
        const errs: RowErrors = {};
        const meterErr = identifierError("Meter number", r.meter_number);
        if (meterErr) errs.meter_number = meterErr;
        else {
          const key = r.meter_number.trim().toLowerCase();
          if (rows.some((o, j) => j !== i && o.meter_number.trim().toLowerCase() === key))
            errs.meter_number = "Duplicate meter number in this batch";
        }
        if (r.serial_number.trim()) {
          const sErr = identifierError("Serial no", r.serial_number);
          if (sErr) errs.serial_number = sErr;
          else if (r.serial_number.trim().toLowerCase() === r.meter_number.trim().toLowerCase())
            errs.serial_number = "Must differ from the meter number";
          else if (
            rows.some(
              (o, j) =>
                j !== i &&
                o.serial_number.trim() &&
                o.serial_number.trim().toLowerCase() === r.serial_number.trim().toLowerCase(),
            )
          )
            errs.serial_number = "Duplicate serial in this batch";
        }
        (["sgc", "krn", "ti", "ea", "ken"] as const).forEach((k) => {
          const err = numberError(k.toUpperCase(), r[k]);
          if (err) errs[k] = err;
        });
        return errs;
      }),
    [rows],
  );

  const headerValid = Object.values(headerErrors).every((e) => !e);
  const invalidRows = rowErrors
    .map((e, i) => ({ index: i, errors: Object.values(e).filter(Boolean) as string[] }))
    .filter((r) => r.errors.length > 0);
  const rowsValid = rows.length > 0 && invalidRows.length === 0;
  const canSubmit = headerValid && rowsValid && (duplicateMode !== "update" || confirmUpdate);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await bulkCreate({
        data: {
          supplier_id: supplierId || null,
          owner_type: ownerType as "vendor" | "landlord" | "agent",
          owner_id: ownerId,
          type: meterType as "electricity" | "water" | "gas",
          price_per_unit: 0,
          initial_reading: 0,
          duplicate_mode: duplicateMode,
          confirm_update: duplicateMode === "update" ? confirmUpdate : false,
          rows: rows.map((r) => ({
            meter_number: r.meter_number.trim(),
            serial_number: r.serial_number.trim(),
            sgc: r.sgc,
            krn: r.krn,
            ti: r.ti,
            ea: r.ea,
            ken: r.ken,
          })),
        },
      } as never);
      return res as BulkAddResult;
    },
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["meters"] });
      setResult(res);
      setReview(false);
      toast.success(
        `${res.created} meter${res.created === 1 ? "" : "s"} added` +
          (res.updated ? `, ${res.updated} updated` : "") +
          (res.skipped ? `, ${res.skipped} skipped` : ""),
      );
    },
    onError: (err: Error) => toast.error(err.message || "Could not add meters"),
  });

  const openReview = () => {
    setSubmitted(true);
    if (!headerValid) {
      toast.error("Complete the required fields above");
      return;
    }
    if (!rows.length) {
      toast.error("Generate the meter rows first");
      return;
    }
    setReview(true);
  };

  const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
  const cell = "h-9 w-full min-w-24 rounded-lg border border-border bg-background px-2 text-sm";
  const show = (e: string | null) =>
    submitted && e ? <span className="mt-1 block text-xs text-destructive">{e}</span> : null;

  return (
    <PortalLayout
      roles={["admin"]}
      title="Add Meters"
      description="Register many meters at once for one supplier and one owner"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <Download className="size-4" /> CSV template
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <Upload className="size-4" /> Fill from CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onTemplateFile(f);
              e.target.value = "";
            }}
          />
          <Link
            to="/meters"
            search={{ page: 1, limit: 10, type: "all", landlordId: "all", q: "", status: "all" }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
        </div>
      }
    >
      <div className="rounded-2xl border border-border bg-card p-5">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-11 w-full animate-pulse rounded-xl bg-muted" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="meter-type">
                Meter type <span className="text-destructive">*</span>
              </label>
              <select
                id="meter-type"
                className={field}
                value={meterType}
                onChange={(e) => setMeterType(e.target.value as typeof meterType)}
              >
                <option value="">Select meter type</option>
                <option value="electricity">Electricity</option>
                <option value="water">Water</option>
                <option value="gas">Gas</option>
              </select>
              {show(headerErrors.meterType)}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="supplier">
                Supplier <span className="text-destructive">*</span>
              </label>
              <select
                id="supplier"
                className={field}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.utility_type ? ` · ${s.utility_type}` : ""}
                  </option>
                ))}
              </select>
              {show(headerErrors.supplierId)}
              {!suppliers.length && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  No active suppliers yet — add one in Meter Suppliers.
                </span>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="user-type">
                User type <span className="text-destructive">*</span>
              </label>
              <select
                id="user-type"
                className={field}
                value={ownerType}
                onChange={(e) => setOwnerType(e.target.value as typeof ownerType)}
              >
                <option value="">Select user type</option>
                <option value="vendor">Vendor</option>
                <option value="landlord">Landlord</option>
                <option value="agent">Agent</option>
              </select>
              {show(headerErrors.ownerType)}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="owner">
                {ownerType ? `Select ${ownerType}` : "Select user"}{" "}
                <span className="text-destructive">*</span>
              </label>
              <select
                id="owner"
                className={field}
                value={ownerId}
                disabled={!ownerType}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                <option value="">
                  {ownerType ? `Select a ${ownerType}` : "Choose a user type first"}
                </option>
                {ownerOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {show(headerErrors.ownerId)}
              {ownerType && !ownerOptions.length && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  No users with the {ownerType} role yet.
                </span>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="count">
                No. of meters <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="count"
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  className={field}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
                <button
                  type="button"
                  onClick={generateRows}
                  className="h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Generate rows
                </button>
              </div>
              {show(headerErrors.count)}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="dup-mode">
                If a meter already exists
              </label>
              <select
                id="dup-mode"
                className={field}
                value={duplicateMode}
                onChange={(e) => setDuplicateMode(e.target.value as DuplicateMode)}
              >
                <option value="reject">Reject the batch (default)</option>
                <option value="skip">Skip existing meter / serial numbers</option>
                <option value="update">Update matching meters</option>
              </select>
              {duplicateMode === "update" && (
                <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirmUpdate}
                    onChange={(e) => setConfirmUpdate(e.target.checked)}
                  />
                  I confirm existing meters with matching numbers should be overwritten.
                </label>
              )}
            </div>
          </div>
        )}
      </div>

      {!isLoading && rows.length === 0 && !result && (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileSpreadsheet className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">No meters to add yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Enter the number of meters above and click{" "}
            <span className="font-medium text-foreground">Generate rows</span>, or use{" "}
            <span className="font-medium text-foreground">Fill from CSV</span> to import existing meter data.
          </p>
        </div>
      )}

      {(importing || rows.length > 0) && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {importing ? "Importing meters…" : `Meter details (${rows.length})`}
            </h2>
            {!importing && (
              <button
                type="button"
                onClick={() => setRows([])}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Clear rows
              </button>
            )}
          </div>

          {importing ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-2">
                  <div className="h-9 w-8 animate-pulse rounded bg-muted" />
                  <div className="h-9 flex-1 animate-pulse rounded bg-muted" />
                  <div className="h-9 flex-1 animate-pulse rounded bg-muted" />
                  <div className="h-9 flex-1 animate-pulse rounded bg-muted" />
                  <div className="h-9 flex-1 animate-pulse rounded bg-muted" />
                  <div className="h-9 flex-1 animate-pulse rounded bg-muted" />
                  <div className="h-9 flex-1 animate-pulse rounded bg-muted" />
                  <div className="h-9 flex-1 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 -mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 font-semibold">#</th>
                  <th className="px-2 py-2 font-semibold">Meter number *</th>
                  <th className="px-2 py-2 font-semibold">Serial no</th>
                  <th className="px-2 py-2 font-semibold">SGC *</th>
                  <th className="px-2 py-2 font-semibold">KRN *</th>
                  <th className="px-2 py-2 font-semibold">TI *</th>
                  <th className="px-2 py-2 font-semibold">EA *</th>
                  <th className="px-2 py-2 font-semibold">KEN *</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const errs = rowErrors[i] ?? {};
                  const inputFor = (key: keyof Row, label: string, numeric = false) => (
                    <td className="px-2 py-1.5 align-top">
                      <input
                        aria-label={`${label} for meter ${i + 1}`}
                        aria-invalid={submitted && Boolean(errs[key])}
                        inputMode={numeric ? "numeric" : "text"}
                        className={`${cell} ${submitted && errs[key] ? "border-destructive" : ""}`}
                        value={r[key]}
                        onChange={(e) => setRow(i, key, e.target.value)}
                      />
                      {submitted && errs[key] ? (
                        <span className="mt-1 block text-[11px] text-destructive">{errs[key]}</span>
                      ) : null}
                    </td>
                  );
                  return (
                    <tr key={i} className="border-b border-border/60">
                      <td className="px-2 py-1.5 align-top text-muted-foreground">{i + 1}</td>
                      {inputFor("meter_number", "Meter number")}
                      {inputFor("serial_number", "Serial no")}
                      {inputFor("sgc", "SGC", true)}
                      {inputFor("krn", "KRN", true)}
                      {inputFor("ti", "TI", true)}
                      {inputFor("ea", "EA", true)}
                      {inputFor("ken", "KEN", true)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      )}

      {result && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Result — {result.created} created, {result.updated} updated, {result.skipped} skipped
          </h2>
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
            {result.results.map((r) => (
              <li key={r.row} className="flex flex-wrap gap-2">
                <span className="text-muted-foreground">Row {r.row}</span>
                <span className="font-medium">{r.meter_number}</span>
                <span
                  className={
                    r.status === "skipped"
                      ? "text-amber-600"
                      : r.status === "failed"
                        ? "text-destructive"
                        : "text-emerald-600"
                  }
                >
                  {r.message}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => navigate({ to: "/meters", search: { page: 1, limit: 10, type: "all", landlordId: "all", q: "", status: "all" } })}
            className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Go to Meter Management
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <Link
          to="/meters"
            search={{ page: 1, limit: 10, type: "all", landlordId: "all", q: "", status: "all" }}
          className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent/10"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={openReview}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="size-4" />
          Review &amp; Add {rows.length || ""} Meters
        </button>
      </div>

      {review && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReview(false);
          }}
        >
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-lg">
            <h2 id="review-title" className="text-lg font-bold">
              Review before creating
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {rows.length} meter{rows.length === 1 ? "" : "s"} · {meterType} ·{" "}
              {suppliers.find((s) => s.id === supplierId)?.name ?? "No supplier"} ·{" "}
              {ownerType}: {ownerOptions.find((o) => o.id === ownerId)?.name ?? "—"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Duplicates:{" "}
              {duplicateMode === "reject"
                ? "reject the whole batch"
                : duplicateMode === "skip"
                  ? "skip existing meter / serial numbers"
                  : "update matching meters (confirmed)"}
            </p>

            {invalidRows.length ? (
              <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
                <p className="text-sm font-semibold text-destructive">
                  {invalidRows.length} row{invalidRows.length === 1 ? "" : "s"} need attention
                </p>
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs text-destructive">
                  {invalidRows.map((r) => (
                    <li key={r.index}>
                      Row {r.index + 1}: {r.errors.join("; ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                All rows passed validation and are ready to be created.
              </div>
            )}

            {duplicateMode === "update" && !confirmUpdate && (
              <p className="mt-3 text-sm text-destructive">
                Tick the confirmation checkbox to allow updating existing meters.
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReview(false)}
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent/10"
              >
                Back to edit
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={!canSubmit || mutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {mutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {mutation.isPending ? "Adding meters…" : "Add Meters"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
