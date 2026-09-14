import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { listVendorPriceRequests, setVendorMeterPrices } from "@/lib/vendor-admin.functions";
import {
  EmptyState,
  ErrorBlock,
  formatDate,
  LoadingBlock,
  StatCard,
  StatusBadge,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/price-management")({
  head: () => ({
    meta: [
      { title: "Price Management · Vendor · SmatraPay" },
      { name: "description", content: "Set the price per unit on the meters registered to your account." },
      { property: "og:title", content: "Price Management · Vendor · SmatraPay" },
      { property: "og:description", content: "Bulk update unit pricing across your own prepaid meters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorPriceManagement,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const MODES = [
  { value: "set", label: "Set price to" },
  { value: "increase_pct", label: "Increase by %" },
  { value: "decrease_pct", label: "Decrease by %" },
  { value: "increase_amount", label: "Increase by amount" },
  { value: "decrease_amount", label: "Decrease by amount" },
] as const;

function VendorPriceManagement() {
  const access = Route.useLoaderData();
  const { data, isLoading, error } = useVendorScope();
  const queryClient = useQueryClient();
  const applyPrices = useServerFn(setVendorMeterPrices);
  const fetchRequests = useServerFn(listVendorPriceRequests);
  const requestsQuery = useQuery({
    queryKey: ["vendor-price-requests"],
    queryFn: () => fetchRequests(),
  });

  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<string>("set");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const meters = data?.meters ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meters.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (!needle) return true;
      return [m.meter_number, m.serial_number, m.resident_name, m.zone_name].some((v) =>
        (v ?? "").toLowerCase().includes(needle),
      );
    });
  }, [meters, q, type]);

  const allSelected = rows.length > 0 && rows.every((m) => selected.includes(m.id));
  const avgPrice = meters.length
    ? meters.reduce((s, m) => s + m.price_per_unit, 0) / meters.length
    : 0;

  async function submit() {
    setMessage(null);
    setFailure(null);
    const numeric = Number(value);
    if (!selected.length) return setFailure("Select at least one meter.");
    if (!Number.isFinite(numeric) || numeric < 0) return setFailure("Enter a valid amount.");
    setBusy(true);
    try {
      const result = await applyPrices({
        data: {
          ids: selected,
          mode: mode as never,
          value: numeric,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      setMessage(
        `${result.submitted} price change(s) sent for admin approval, ${result.unchanged} unchanged.`,
      );
      setSelected([]);
      setValue("");
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["vendor-scope"] });
      await queryClient.invalidateQueries({ queryKey: ["vendor-price-requests"] });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Could not submit price changes.");
    } finally {
      setBusy(false);
    }
  }

  const requests = requestsQuery.data ?? [];
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <DashboardShell
      access={access}
      title="Price management"
      description="Propose price per unit changes on your own meters. An admin approves them before they go live."
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : meters.length === 0 ? (
        <EmptyState title="No meters" message="No meters are registered to your vendor account yet." />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Meters" value={meters.length} />
            <StatCard label="Average price / unit" value={`KES ${avgPrice.toFixed(2)}`} />
            <StatCard label="Selected" value={selected.length} />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">Apply a price change</h2>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-muted-foreground">
                Change
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="mt-1 block rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Value
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="mt-1 block w-32 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <button className="btn-primary px-4 py-2 text-sm" disabled={busy} onClick={submit}>
                {busy ? "Applying…" : `Apply to ${selected.length} meter(s)`}
              </button>
            </div>
            {message && <p className="mt-3 text-sm text-emerald-600">{message}</p>}
            {failure && <p className="mt-3 text-sm text-destructive">{failure}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search meter, serial, resident or zone"
                aria-label="Search meters"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label="Filter by meter type"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All types</option>
              <option value="electricity">Electricity</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all meters"
                      checked={allSelected}
                      onChange={(e) =>
                        setSelected(e.target.checked ? rows.map((m) => m.id) : [])
                      }
                    />
                  </th>
                  <th className="px-4 py-2">Meter</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Zone</th>
                  <th className="px-4 py-2">Resident</th>
                  <th className="px-4 py-2">Price / unit</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select meter ${m.meter_number}`}
                        checked={selected.includes(m.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-semibold">{m.meter_number}</p>
                      <p className="text-xs text-muted-foreground">{m.serial_number}</p>
                    </td>
                    <td className="px-4 py-2">{titleCase(m.type)}</td>
                    <td className="px-4 py-2">{m.zone_name ?? "—"}</td>
                    <td className="px-4 py-2">{m.resident_name ?? "—"}</td>
                    <td className="px-4 py-2 font-semibold">KES {m.price_per_unit.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge value={m.status} />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No meters match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
