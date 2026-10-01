import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getVendorDirectory } from "@/lib/vendor-admin.functions";
import {
  downloadCsv,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatCard,
  StatusBadge,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/meter-suppliers")({
  head: () => ({
    meta: [
      { title: "Meter Suppliers · Vendor · SmatraPay" },
      { name: "description", content: "Suppliers of the meters registered to your vendor account." },
      { property: "og:title", content: "Meter Suppliers · Vendor · SmatraPay" },
      { property: "og:description", content: "Contact details and meter counts for each of your suppliers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorSuppliers,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

function VendorSuppliers() {
  const access = Route.useLoaderData();
  const fetchDirectory = useServerFn(getVendorDirectory);
  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor-directory"],
    queryFn: () => fetchDirectory(),
  });
  const [q, setQ] = useState("");

  const suppliers = data?.suppliers ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return suppliers;
    return suppliers.filter((s) =>
      [s.company_name, s.contact_name, s.email, s.phone_number, s.utility_type].some((v) =>
        (v ?? "").toLowerCase().includes(needle),
      ),
    );
  }, [suppliers, q]);

  return (
    <DashboardShell
      access={access}
      title="Meter suppliers"
      description="Suppliers behind the meters registered to your account."
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : suppliers.length === 0 ? (
        <EmptyState title="No suppliers" message="None of your meters record a supplier yet." />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Suppliers" value={suppliers.length} />
            <StatCard label="Meters supplied" value={suppliers.reduce((s, x) => s + x.meter_count, 0)} />
            <StatCard label="Active meters" value={suppliers.reduce((s, x) => s + x.active_meters, 0)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search supplier, contact or utility"
                aria-label="Search suppliers"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <button
              className="btn-outline px-4 py-2 text-sm"
              onClick={() =>
                downloadCsv(
                  "vendor-meter-suppliers.csv",
                  ["Supplier", "Utility", "Licence", "Contact", "Email", "Phone", "Meters", "Active", "Status"],
                  rows.map((s) => [
                    s.company_name,
                    s.utility_type,
                    s.license_number ?? "",
                    s.contact_name ?? "",
                    s.email ?? "",
                    s.phone_number ?? "",
                    s.meter_count,
                    s.active_meters,
                    s.status,
                  ]),
                )
              }
            >
              Export CSV
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((s) => (
              <article key={s.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{s.company_name}</h2>
                    <p className="text-xs text-muted-foreground">{s.utility_type}</p>
                  </div>
                  <StatusBadge value={s.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Licence</dt>
                    <dd>{s.license_number ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Contact</dt>
                    <dd>{s.contact_name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="break-all">{s.email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>{s.phone_number ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Meters supplied</dt>
                    <dd className="font-semibold">{s.meter_count}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Active meters</dt>
                    <dd className="font-semibold">{s.active_meters}</dd>
                  </div>
                </dl>
              </article>
            ))}
            {rows.length === 0 && (
              <EmptyState title="No matches" message="No suppliers match this search." />
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
