import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  StatCard,
  StatusBadge,
  downloadCsv,
  formatDate,
  useVendorScope,
} from "@/components/vendor/VendorUI";
import { Field, VendorModal } from "@/components/vendor/VendorModal";
import { listVendorTokens, requestVendorToken, type VendorTokenRow } from "@/lib/vendor-ops.functions";

const PAGE_SIZE = 10;

export const Route = createFileRoute("/_authenticated/vendor/tokens")({
  head: () => ({
    meta: [
      { title: "Token & Payments · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Prepaid token requests, payment status and resident token support for your meters.",
      },
      { property: "og:title", content: "Token & Payments · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Track prepaid token transactions and assist residents with payment issues.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorTokens,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

function VendorTokens() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();
  const scope = useVendorScope();
  const fetchTokens = useServerFn(listVendorTokens);
  const requestToken = useServerFn(requestVendorToken);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<VendorTokenRow | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [residentId, setResidentId] = useState("");
  const [meterId, setMeterId] = useState("");
  const [amount, setAmount] = useState("");

  const tokensQuery = useQuery({
    queryKey: ["vendor-tokens", from, to],
    queryFn: () =>
      fetchTokens({
        data: {
          ...(from ? { from: new Date(from).toISOString() } : {}),
          ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
        },
      }),
  });

  const meters = scope.data?.meters ?? [];
  const residents = scope.data?.residents ?? [];
  const meterById = useMemo(() => new Map(meters.map((m) => [m.id, m])), [meters]);

  const tokens = tokensQuery.data?.tokens ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tokens.filter((t) => {
      const meter = meterById.get(t.meter_id);
      if (status !== "all" && t.status !== status) return false;
      if (!q) return true;
      return [t.token, t.reference ?? "", meter?.meter_number ?? "", meter?.resident_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [tokens, search, status, meterById]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTokens = tokens.filter((t) => new Date(t.created_at) >= todayStart);
  const successful = tokens.filter((t) => t.status === "issued");
  const failed = tokens.filter((t) => t.status === "revoked");
  const pending = tokens.filter((t) => !t.payment_status);
  const totalAmount = tokens.reduce((sum, t) => sum + t.amount, 0);

  const residentMeters = residentId
    ? meters.filter((m) => m.resident_id === residentId)
    : meters.filter((m) => m.status === "active");

  const mutation = useMutation({
    mutationFn: () =>
      requestToken({
        data: {
          meter_id: meterId,
          resident_id: residentId || null,
          amount: Number(amount),
        },
      }),
    onSuccess: async (res) => {
      setRequesting(false);
      setAmount("");
      setMeterId("");
      setResidentId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendor-tokens"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast.success(`Token issued: ${res.token.token}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detailMeter = detail ? meterById.get(detail.meter_id) : undefined;

  return (
    <DashboardShell
      access={access}
      title="Token & Payments"
      description="Prepaid token requests and payment status for meters on your account."
      actions={
        <div className="flex gap-2">
          <button
            className="btn-outline px-3 py-1.5 text-sm"
            onClick={() =>
              downloadCsv(
                "vendor-token-transactions.csv",
                ["Transaction", "Meter", "Resident", "Zone", "Amount", "Token", "Status", "Payment", "Date"],
                filtered.map((t) => {
                  const m = meterById.get(t.meter_id);
                  return [
                    t.reference ?? t.id,
                    m?.meter_number ?? "",
                    m?.resident_name ?? "",
                    m?.zone_name ?? "",
                    t.amount,
                    t.token,
                    t.status,
                    t.payment_status ?? "pending",
                    t.created_at,
                  ];
                }),
              )
            }
          >
            Export CSV
          </button>
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => setRequesting(true)}>
            Request token
          </button>
        </div>
      }
    >
      {scope.error || tokensQuery.error ? (
        <ErrorBlock message={((scope.error ?? tokensQuery.error) as Error).message} />
      ) : scope.isLoading || tokensQuery.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4 pb-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Token requests today" value={todayTokens.length} />
            <StatCard label="Successful transactions" value={successful.length} />
            <StatCard label="Failed / revoked" value={failed.length} />
            <StatCard label="Pending payment" value={pending.length} />
            <StatCard label="Total amount" value={totalAmount.toLocaleString()} />
            <StatCard label="Transactions" value={tokens.length} />
          </div>

          <div className="grid gap-2 rounded-2xl border border-border bg-card p-3 md:grid-cols-4">
            <input
              className="input"
              placeholder="Search token, reference, meter or resident"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search transactions"
            />
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="all">Any status</option>
              <option value="issued">Successful</option>
              <option value="expired">Expired</option>
              <option value="revoked">Reversed / cancelled</option>
            </select>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>

          {current.length === 0 ? (
            <EmptyState title="No transactions" message="No token transactions match these filters." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Transaction</th>
                    <th className="px-4 py-3">Meter</th>
                    <th className="px-4 py-3">Resident</th>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Token</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((t) => {
                    const m = meterById.get(t.meter_id);
                    return (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-4 py-3 font-semibold text-foreground">{t.reference ?? t.id.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m?.meter_number ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m?.resident_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m?.zone_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.amount.toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.token}</td>
                        <td className="px-4 py-3">
                          <StatusBadge value={t.status} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={t.payment_status ?? "pending"} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(t.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <button className="btn-outline px-3 py-1 text-xs" onClick={() => setDetail(t)}>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Completed transactions are read-only. Amounts, provider references and payment status cannot be edited
            from the vendor portal.
          </p>
        </div>
      )}

      {requesting && (
        <VendorModal title="Request token" onClose={() => setRequesting(false)}>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Resident
              <select
                className="input mt-1"
                value={residentId}
                onChange={(e) => {
                  setResidentId(e.target.value);
                  setMeterId("");
                }}
              >
                <option value="">Select a resident</option>
                {residents.map((r) => (
                  <option key={`${r.id}-${r.unit_id}`} value={r.id}>
                    {r.name ?? r.email} — {r.unit_label ?? "unit"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Meter
              <select className="input mt-1" value={meterId} onChange={(e) => setMeterId(e.target.value)}>
                <option value="">Select a meter</option>
                {residentMeters.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.status !== "active"}>
                    {m.meter_number} {m.status !== "active" ? "(not active)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold uppercase text-muted-foreground">
              Amount
              <input
                className="input mt-1"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setRequesting(false)}>
                Cancel
              </button>
              <button
                className="btn-primary px-3 py-1.5 text-sm"
                disabled={!meterId || !(Number(amount) > 0) || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Processing…" : "Submit request"}
              </button>
            </div>
          </div>
        </VendorModal>
      )}

      {detail && (
        <VendorModal title="Transaction details" onClose={() => setDetail(null)} wide>
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Payment</h3>
              <Field label="Transaction ID" value={detail.reference ?? detail.id} />
              <Field label="Amount" value={detail.amount.toLocaleString()} />
              <Field label="Payment status" value={<StatusBadge value={detail.payment_status ?? "pending"} />} />
              <Field label="Payment date" value={formatDate(detail.created_at)} />
            </section>
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Meter</h3>
              <Field label="Meter number" value={detailMeter?.meter_number ?? "—"} />
              <Field label="Serial number" value={detailMeter?.serial_number ?? "—"} />
              <Field label="Meter type" value={detailMeter?.type ?? "—"} />
              <Field label="Zone" value={detailMeter?.zone_name ?? "—"} />
            </section>
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Resident</h3>
              <Field label="Name" value={detailMeter?.resident_name ?? "—"} />
              <Field label="Phone" value={detail.customer_phone ?? "—"} />
            </section>
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Token</h3>
              <Field label="Token" value={<span className="font-mono">{detail.token}</span>} />
              <Field label="Units" value={detail.units} />
              <Field label="Token status" value={<StatusBadge value={detail.status} />} />
              <Field label="Generated" value={formatDate(detail.created_at)} />
              <Field label="Expires" value={formatDate(detail.expires_at)} />
            </section>
          </div>
        </VendorModal>
      )}
    </DashboardShell>
  );
}
