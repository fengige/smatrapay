import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { listVendorResidentPayments } from "@/lib/vendor.functions";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatusBadge,
  formatDate,
  installationLabel,
  titleCase,
  useVendorScope,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/residents/$residentId")({
  head: () => ({
    meta: [
      { title: "Resident Details · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Resident profile, property, meter and payment history within your vendor zones.",
      },
      { property: "og:title", content: "Resident Details · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Everything you need about one resident you serve.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorResidentDetail,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function VendorResidentDetail() {
  const access = Route.useLoaderData();
  const { residentId } = Route.useParams();
  const { data, isLoading, error } = useVendorScope();
  const fetchPayments = useServerFn(listVendorResidentPayments);
  const { data: paymentData } = useQuery({
    queryKey: ["vendor-resident-payments", residentId],
    queryFn: () => fetchPayments({ data: { resident_id: residentId } }),
  });

  const records = (data?.residents ?? []).filter((r) => r.id === residentId);
  const resident = records[0];

  return (
    <DashboardShell
      access={access}
      title={resident?.name ?? "Resident"}
      description="Resident details"
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : !resident ? (
        <EmptyState
          title="Resident not found"
          message="This resident is not associated with your assigned zones."
        />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link to="/vendor/residents" className="btn-outline inline-flex items-center gap-1 px-3 py-1">
              <ArrowLeft className="size-3" /> Back to residents
            </Link>
            <span>Vendor Portal → Resident Management → {resident.name ?? "Resident"}</span>
          </div>

          <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5">
            {resident.profile_image ? (
              <img
                src={resident.profile_image}
                alt={resident.name ?? "Resident"}
                className="size-16 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-full bg-secondary text-lg font-bold">
                {(resident.name ?? resident.email ?? "R").slice(0, 1).toUpperCase()}
              </span>
            )}
            <dl className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Full name" value={resident.name ?? "—"} />
              <Info label="Phone" value={resident.phone ?? "—"} />
              <Info label="Email" value={resident.email ?? "—"} />
              <Info label="Registered" value={formatDate(resident.created_at)} />
            </dl>
            <StatusBadge value={resident.status} />
          </section>

          {records.map((record) => (
            <section
              key={`${record.id}-${record.unit_id}`}
              className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Info label="Property" value={record.property_name ?? "—"} />
              <Info label="Unit" value={record.unit_label ?? "—"} />
              <Info label="Zone" value={record.zone_name ?? "—"} />
              <Info label="Assignment date" value={formatDate(record.assigned_at)} />
              <Info label="Meter number" value={record.meter_number ?? "—"} />
              <Info label="Meter type" value={titleCase(record.meter_type)} />
              <Info label="Meter status" value={titleCase(record.meter_status)} />
              <Info label="Installation" value={installationLabel(record.installation_status)} />
              {record.meter_id && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <Link
                    to="/vendor/meters/$meterId"
                    params={{ meterId: record.meter_id }}
                    className="text-sm font-semibold text-primary"
                  >
                    View meter
                  </Link>
                </div>
              )}
            </section>
          ))}

          <section className="rounded-2xl border border-border bg-card">
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold text-foreground">Prepaid account</h2>
              <Link to="/vendor/tokens" className="text-xs font-semibold text-primary">
                View token history
              </Link>
            </header>
            {residentTokens.length === 0 ? (
              <EmptyState
                title="No prepaid activity"
                message="No tokens have been issued for this resident's meters yet."
              />
            ) : (
              <div className="overflow-x-auto">
                <dl className="grid gap-3 px-4 py-3 sm:grid-cols-4">
                  <Info label="Meters" value={residentMeters.map((m) => m.meter_number).join(", ") || "—"} />
                  <Info label="Last token" value={residentTokens[0]?.token ?? "—"} />
                  <Info label="Last token date" value={formatDate(residentTokens[0]?.created_at)} />
                  <Info
                    label="Tokens purchased"
                    value={`${residentTokens.length} · ${residentTokens
                      .reduce((s, t) => s + t.amount, 0)
                      .toLocaleString()}`}
                  />
                </dl>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Meter</th>
                      <th className="px-4 py-2">Token</th>
                      <th className="px-4 py-2">Units</th>
                      <th className="px-4 py-2">Amount</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {residentTokens.slice(0, 10).map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-4 py-2">{formatDate(t.created_at)}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {residentMeters.find((m) => m.id === t.meter_id)?.meter_number ?? "—"}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{t.token}</td>
                        <td className="px-4 py-2 text-muted-foreground">{t.units}</td>
                        <td className="px-4 py-2 text-muted-foreground">{t.amount.toLocaleString()}</td>
                        <td className="px-4 py-2">
                          <StatusBadge value={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card">
            <header className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold text-foreground">Payments</h2>
              <p className="text-xs text-muted-foreground">
                Total paid: {paymentData?.total_paid ?? 0} · Last payment:{" "}
                {formatDate(paymentData?.last_payment?.paid_at ?? paymentData?.last_payment?.created_at)}
              </p>
            </header>
            {(paymentData?.payments ?? []).length === 0 ? (
              <EmptyState title="No payments" message="No payment records exist for this resident." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Reference</th>
                      <th className="px-4 py-2">Description</th>
                      <th className="px-4 py-2">Amount</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(paymentData?.payments ?? []).map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-4 py-2">{formatDate(p.paid_at ?? p.created_at)}</td>
                        <td className="px-4 py-2">{p.reference ?? "—"}</td>
                        <td className="px-4 py-2">{p.description ?? "—"}</td>
                        <td className="px-4 py-2">
                          {p.currency} {p.amount}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge value={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
