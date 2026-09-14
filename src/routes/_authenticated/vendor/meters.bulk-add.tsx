import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { bulkAddVendorMeters, listVendorSuppliers } from "@/lib/vendor.functions";
import { ErrorBlock } from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/meters/bulk-add")({
  head: () => ({
    meta: [
      { title: "Bulk Add Meters · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Register many meters at once against your vendor account in one validated batch.",
      },
      { property: "og:title", content: "Bulk Add Meters · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Generate rows, validate them and save the whole batch in one go.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorBulkAdd,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

type Row = { meter_number: string; serial_number: string; sgc: string; krn: string; ti: string; ea: string; ken: string };

const emptyRow = (): Row => ({ meter_number: "", serial_number: "", sgc: "", krn: "", ti: "", ea: "", ken: "" });

function VendorBulkAdd() {
  const access = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchSuppliers = useServerFn(listVendorSuppliers);
  const submit = useServerFn(bulkAddVendorMeters);
  const { data: supplierData } = useQuery({
    queryKey: ["vendor-suppliers"],
    queryFn: () => fetchSuppliers(),
  });

  const [supplierId, setSupplierId] = useState("");
  const [type, setType] = useState("electricity");
  const [price, setPrice] = useState("");
  const [reading, setReading] = useState("");
  const [count, setCount] = useState(5);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<
    { row: number; meter_number: string; status: string; message: string }[]
  >([]);

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          supplier_id: supplierId || null,
          type: type as "electricity" | "water" | "gas",
          price_per_unit: price,
          initial_reading: reading,
          rows: rows.map((r) => ({
            meter_number: r.meter_number.trim(),
            serial_number: r.serial_number.trim(),
            sgc: r.sgc.trim(),
            krn: r.krn.trim(),
            ti: r.ti.trim(),
            ea: r.ea.trim(),
            ken: r.ken.trim(),
          })),
        },
      }),
    onSuccess: async (summary) => {
      setResults(summary.results ?? []);
      if (summary.failed > 0 || !summary.ok) {
        setError("The batch was rejected. Fix the rows listed below and try again.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
      toast.success(`Meters Added: ${summary.created}`);
      navigate({ to: "/vendor/meters" });
    },
    onError: (e: Error) => setError(e.message),
  });

  const invalidRows = rows
    .map((r, i) => ({ i, r }))
    .filter(({ r }) => r.meter_number.trim().length < 4);

  return (
    <DashboardShell
      access={access}
      title="Bulk add meters"
      description="All meters are registered to your vendor account."
    >
      <div className="space-y-4 pb-6">
        <Link to="/vendor/meters" className="btn-outline inline-flex items-center gap-1 px-3 py-1 text-xs">
          <ArrowLeft className="size-3" /> Back to meters
        </Link>

        {error && <ErrorBlock message={error} />}

        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
              Supplier
            </span>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">No supplier</option>
              {(supplierData?.suppliers ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.company_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
              Meter type
            </span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="electricity">Electricity</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
              Price per unit
            </span>
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
              Initial reading
            </span>
            <input className="input" value={reading} onChange={(e) => setReading(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
              Number of meters
            </span>
            <span className="flex gap-2">
              <input
                className="input"
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
              <button
                className="btn-outline whitespace-nowrap px-3 text-sm"
                onClick={() =>
                  setRows(Array.from({ length: Math.min(Math.max(count, 1), 500) }, emptyRow))
                }
              >
                Generate
              </button>
            </span>
          </label>
        </div>

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Meter number *</th>
                  <th className="px-3 py-2">Serial number</th>
                  <th className="px-3 py-2">SGC</th>
                  <th className="px-3 py-2">KRN</th>
                  <th className="px-3 py-2">TI</th>
                  <th className="px-3 py-2">EA</th>
                  <th className="px-3 py-2">KEN</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const result = results.find((r) => r.row === i + 1);
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      {(
                        ["meter_number", "serial_number", "sgc", "krn", "ti", "ea", "ken"] as const
                      ).map((key) => (
                        <td key={key} className="px-3 py-1">
                          <input
                            className="input"
                            aria-label={`${key} row ${i + 1}`}
                            value={row[key]}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, idx) => (idx === i ? { ...r, [key]: e.target.value } : r)),
                              )
                            }
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-xs">
                        {result ? (
                          <span
                            className={
                              result.status === "created" ? "text-emerald-600" : "text-destructive"
                            }
                          >
                            {result.message || result.status}
                          </span>
                        ) : row.meter_number.trim().length < 4 ? (
                          <span className="text-destructive">Meter number too short</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">
              {invalidRows.length > 0 ? `${invalidRows.length} row(s) need attention` : "Ready to save"}
            </span>
            <button
              className="btn-primary px-4 py-2 text-sm"
              disabled={mutation.isPending || invalidRows.length > 0}
              onClick={() => {
                setError(null);
                setResults([]);
                mutation.mutate();
              }}
            >
              {mutation.isPending ? "Saving…" : `Save ${rows.length} meters`}
            </button>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
