import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import {
  listPaymentHistory,
  listPayees,
  recordPayment,
  setPaymentStatus,
  type PaymentStatus,
} from "@/lib/payment-history.functions";
import { listPaymentAccounts, type PaymentUserType } from "@/lib/payment-accounts.functions";
import { listPaymentMethods } from "@/lib/payment-methods.functions";

export const Route = createFileRoute("/_authenticated/payment-history")({
  head: () => ({
    meta: [
      { title: "Payment History · SmatraPay" },
      {
        name: "description",
        content:
          "Pending and completed payments grouped by landlord, agent and vendor, with the payment method and account used.",
      },
      { property: "og:title", content: "Payment History · SmatraPay" },
      {
        property: "og:description",
        content: "Track payouts to landlords, agents and vendors with method and account details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentHistoryPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{(error as Error).message}</div>
  ),
});

const KIND_TONE: Record<string, string> = {
  agent: "bg-sky-500/12 text-sky-600",
  vendor: "bg-violet-500/12 text-violet-600",
  landlord: "bg-emerald-500/12 text-emerald-600",
};

const STATUS_TONE: Record<PaymentStatus, string> = {
  pending: "bg-amber-500/12 text-amber-600",
  completed: "bg-emerald-500/12 text-emerald-600",
  failed: "bg-destructive/12 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const DETAIL_ROUTE = {
  agent: "/agents/$id",
  vendor: "/vendors/$id",
  landlord: "/landlords/$id",
} as const;

function money(value: number, currency = "KES") {
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function PaymentHistoryPage() {
  const queryClient = useQueryClient();
  const fetchHistory = useServerFn(listPaymentHistory);
  const updateStatus = useServerFn(setPaymentStatus);

  const [status, setStatus] = useState<"all" | PaymentStatus>("all");
  const [kind, setKind] = useState<"all" | PaymentUserType>("all");
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useQuery({
    queryKey: ["payment-history", status, kind, q],
    queryFn: () => fetchHistory({ data: { status, kind, q } }),
    placeholderData: (prev) => prev,
  });

  useRealtimeRefresh("payment-history", ["payments"], [["payment-history"]]);

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: PaymentStatus }) => updateStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Payment updated");
      queryClient.invalidateQueries({ queryKey: ["payment-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = query.data;
  const totals = data?.totals;

  const exportCsv = () => {
    const rows = data?.payments ?? [];
    const header = [
      "date",
      "payee_type",
      "payee",
      "status",
      "amount",
      "currency",
      "method",
      "account",
      "reference",
      "description",
      "paid_at",
    ];
    const body = rows.map((p) =>
      [
        new Date(p.created_at).toISOString(),
        p.payee_type,
        p.payee_name,
        p.status,
        p.amount,
        p.currency,
        p.method_name ?? "",
        p.account_label ?? "",
        p.reference ?? "",
        p.description ?? "",
        p.paid_at ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payment-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PortalLayout
      roles={["admin"]}
      title="Payment History"
      description="Pending and completed payments grouped by landlord, agent and vendor"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" /> Record payment
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-muted"
          >
            <Download className="size-4" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-muted"
          >
            <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pending", value: money(totals?.pending ?? 0), icon: Clock },
            { label: "Completed", value: money(totals?.completed ?? 0), icon: CheckCircle2 },
            { label: "Payments", value: String(totals?.count ?? 0), icon: CreditCard },
            { label: "Payees", value: String(totals?.payees ?? 0), icon: Users },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <card.icon className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search payee, reference, method or account"
              aria-label="Search payments"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as never)}
            aria-label="Filter by payee type"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All payees</option>
            <option value="landlord">Landlords</option>
            <option value="agent">Agents</option>
            <option value="vendor">Vendors</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as never)}
            aria-label="Filter by status"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {query.isLoading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        ) : !(data?.groups ?? []).length ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No payments match these filters yet. Use “Record payment” to add one.
          </div>
        ) : (
          <div className="space-y-4">
            {data!.groups.map((group) => (
              <section
                key={`${group.kind}:${group.payee_id}`}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Link
                      to={DETAIL_ROUTE[group.kind]}
                      params={{ id: group.payee_id }}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${KIND_TONE[group.kind]}`}
                    >
                      {group.kind}
                    </Link>
                    <h2 className="text-sm font-semibold text-foreground">{group.payee_name}</h2>
                    <span className="text-xs text-muted-foreground">
                      {group.count} payment{group.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-amber-600">
                      Pending {money(group.pending_amount)}
                    </span>
                    <span className="text-emerald-600">
                      Completed {money(group.completed_amount)}
                    </span>
                  </div>
                </header>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2 font-semibold">Date</th>
                        <th className="px-5 py-2 font-semibold">Method</th>
                        <th className="px-5 py-2 font-semibold">Account</th>
                        <th className="px-5 py-2 font-semibold">Reference</th>
                        <th className="px-5 py-2 text-right font-semibold">Amount</th>
                        <th className="px-5 py-2 font-semibold">Status</th>
                        <th className="px-5 py-2 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.payments.map((p) => (
                        <tr key={p.id} className="border-b border-border/60 last:border-0">
                          <td className="px-5 py-3 text-muted-foreground">
                            {new Date(p.created_at).toLocaleString()}
                          </td>
                          <td className="px-5 py-3">{p.method_name ?? "—"}</td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {p.account_label ?? "—"}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {p.reference ?? p.description ?? "—"}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold">
                            {money(p.amount, p.currency)}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_TONE[p.status]}`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {p.status === "pending" ? (
                              <button
                                type="button"
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({ id: p.id, status: "completed" })
                                }
                                className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                              >
                                Mark completed
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {dialogOpen ? <RecordPaymentDialog onClose={() => setDialogOpen(false)} /> : null}
    </PortalLayout>
  );
}

function RecordPaymentDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useServerFn(recordPayment);
  const fetchPayees = useServerFn(listPayees);
  const fetchMethods = useServerFn(listPaymentMethods);
  const fetchAccounts = useServerFn(listPaymentAccounts);

  const payeesQuery = useQuery({ queryKey: ["payees"], queryFn: () => fetchPayees() });
  const methodsQuery = useQuery({ queryKey: ["payment-methods"], queryFn: () => fetchMethods() });
  const accountsQuery = useQuery({
    queryKey: ["payment-accounts"],
    queryFn: () => fetchAccounts(),
  });

  const [payeeKey, setPayeeKey] = useState("");
  const [methodId, setMethodId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const payees = payeesQuery.data?.payees ?? [];
  const [payeeType, payeeId] = payeeKey ? payeeKey.split(":") : ["", ""];

  const accounts = useMemo(
    () => (accountsQuery.data?.accounts ?? []).filter((a) => a.user_id === payeeId),
    [accountsQuery.data, payeeId],
  );

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          payee_type: payeeType as PaymentUserType,
          payee_id: payeeId,
          payment_method_id: methodId || null,
          payment_account_id: accountId || null,
          amount: Number(amount),
          currency: "KES",
          status,
          reference: reference.trim() || null,
          description: description.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      queryClient.invalidateQueries({ queryKey: ["payment-history"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!payeeId) return setError("Select the landlord, agent or vendor being paid.");
    if (!(Number(amount) > 0)) return setError("Enter an amount greater than zero.");
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Record payment"
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Record payment</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Log a pending or completed payment to a landlord, agent or vendor.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Payee</span>
            <select
              value={payeeKey}
              onChange={(e) => {
                setPayeeKey(e.target.value);
                setAccountId("");
              }}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select landlord, agent or vendor</option>
              {payees.map((p) => (
                <option key={`${p.type}:${p.id}`} value={`${p.type}:${p.id}`}>
                  {p.name} ({p.type})
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-foreground">Payment method</span>
              <select
                value={methodId}
                onChange={(e) => setMethodId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {(methodsQuery.data?.methods ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">Account used</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.payment_method_name} · {a.account_number_masked}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-foreground">Amount</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PaymentStatus)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. MPESA code or payout batch"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {mutation.isPending ? "Saving…" : "Save payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
