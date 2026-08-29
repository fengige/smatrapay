import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { bulkAddMeters, listBulkMeterOptions } from "@/lib/meters.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/meters/bulk-add")({
  head: () => ({
    meta: [
      { title: "Bulk Add Meters · SmatraPay" },
      {
        name: "description",
        content:
          "Register many electricity, water or gas meters at once against a supplier and a vendor, landlord or agent.",
      },
      { property: "og:title", content: "Bulk Add Meters · SmatraPay" },
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

function BulkAddMetersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadOptions = useServerFn(listBulkMeterOptions);
  const bulkCreate = useServerFn(bulkAddMeters);

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

  useEffect(() => {
    setOwnerId("");
  }, [ownerType]);

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
          else if (
            r.serial_number.trim().toLowerCase() === r.meter_number.trim().toLowerCase()
          )
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
  const rowsValid = rows.length > 0 && rowErrors.every((e) => Object.keys(e).length === 0);
  const canSubmit = headerValid && rowsValid;

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
      return (res as { created: number }).created;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["meters"] });
      toast.success(`${created} meter${created === 1 ? "" : "s"} added successfully`);
      navigate({ to: "/meters" });
    },
    onError: (err: Error) => toast.error(err.message || "Could not add meters"),
  });

  const submit = () => {
    setSubmitted(true);
    if (!headerValid) {
      toast.error("Complete the required fields above");
      return;
    }
    if (!rows.length) {
      toast.error("Generate the meter rows first");
      return;
    }
    if (!rowsValid) {
      toast.error("Fix the highlighted meter rows");
      return;
    }
    mutation.mutate();
  };

  const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
  const cell = "h-9 w-full min-w-24 rounded-lg border border-border bg-background px-2 text-sm";
  const errText = "mt-1 block text-xs text-destructive";

  const show = (e: string | null) => (submitted && e ? <span className={errText}>{e}</span> : null);

  return (
    <PortalLayout
      roles={["admin"]}
      title="Bulk Add Meters"
      description="Register many meters at once for one supplier and one owner"
      actions={
        <Link
          to="/meters"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
        >
          <ArrowLeft className="size-4" /> Back to Meter Management
        </Link>
      }
    >
      <div className="rounded-2xl border border-border bg-card p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading options…</p>
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
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Meter details ({rows.length})
            </h2>
            <button
              type="button"
              onClick={() => setRows([])}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Clear rows
            </button>
          </div>

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
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <Link
          to="/meters"
          className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent/10"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending || (submitted && !canSubmit)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          {mutation.isPending ? "Adding meters…" : `Add ${rows.length || ""} Meters`.trim()}
        </button>
      </div>
    </PortalLayout>
  );
}
