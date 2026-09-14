import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { listVendorTokens } from "@/lib/vendor-ops.functions";
import {
  downloadCsv,
  EmptyState,
  ErrorBlock,
  formatDate,
  LoadingBlock,
  Pagination,
  StatCard,
  StatusBadge,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/token-management")({
  head: () => ({
    meta: [
      { title: "Token Management · Vendor · SmatraPay" },
      { name: "description", content: "Every prepaid token issued against your own meters." },
      { property: "og:title", content: "Token Management · Vendor · SmatraPay" },
      { property: "og:description", content: "Search, filter and export tokens issued on your meters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorTokenManagement,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const PAGE_SIZE = 12;

function VendorTokenManagement() {
  const access = Route.useLoaderData();
  const scope = useVendorScope();
  const fetchTokens = useServerFn(listVendorTokens);
  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor-token-management"],
    queryFn: () => fetchTokens({ data: {} }),
  });

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const meterNumber = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of scope.data?.meters ?? []) map.set(m.id, m.meter_number);
    return map;
  }, [scope.data]);

  const tokens = data?.tokens ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tokens.filter((t: any) => {
      if (status !== "all" && t.status !== status) return false;
      if (!needle) return true;
      return [t.token, t.reference, t.customer_phone, meterNumber.get(t.meter_id)].some((v) =>
        (v ?? "").toLowerCase().includes(needle),
      );
    });
  }, [tokens, q, status, meterNumber]);

  const totalAmount = rows.reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
  const totalUnits = rows.reduce((s: number, t: any) => s + Number(t.units ?? 0), 0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DashboardShell
      access={access}
      title="Token management"
      description="Prepaid tokens issued on the meters registered to you."
      actions={
        <Link to="/vendor/tokens" className="btn-primary px-4">
          Request token
        </Link>
      }
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Tokens" value={rows.length} />
            <StatCard label="Units sold" value={totalUnits.toFixed(2)} />
            <StatCard label="Total amount" value={`KES ${totalAmount.toLocaleString()}`} />
            <StatCard
              label="Issued tokens"
              value={rows.filter((t: any) => t.status === "issued").length}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search token, meter, reference or phone"
                aria-label="Search tokens"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="issued">Issued</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </select>
            <button
              className="btn-outline px-4 py-2 text-sm"
              onClick={() =>
                downloadCsv(
                  "vendor-tokens.csv",
                  ["Date", "Meter", "Token", "Action", "Units", "Amount", "Reference", "Status"],
                  rows.map((t: any) => [
                    formatDate(t.created_at),
                    meterNumber.get(t.meter_id) ?? "",
                    t.token,
                    t.action,
                    t.units,
                    t.amount,
                    t.reference ?? "",
                    t.status,
                  ]),
                )
              }
            >
              Export CSV
            </button>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No tokens" message="No tokens have been issued on your meters yet." />
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Meter</th>
                      <th className="px-4 py-2">Token</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Units</th>
                      <th className="px-4 py-2">Amount</th>
                      <th className="px-4 py-2">Reference</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.map((t: any) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-4 py-2">{formatDate(t.created_at)}</td>
                        <td className="px-4 py-2 font-semibold">{meterNumber.get(t.meter_id) ?? "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{t.token}</td>
                        <td className="px-4 py-2">{titleCase(String(t.action).replace(/_/g, " "))}</td>
                        <td className="px-4 py-2">{Number(t.units ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-2">KES {Number(t.amount ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2">{t.reference ?? "—"}</td>
                        <td className="px-4 py-2">
                          <StatusBadge value={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageCount={pageCount} onPage={setPage} total={rows.length} />
            </>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
