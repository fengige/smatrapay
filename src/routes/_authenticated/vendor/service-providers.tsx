import { createFileRoute, Link } from "@tanstack/react-router";
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
  Pagination,
  StatCard,
  StatusBadge,
} from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/service-providers")({
  head: () => ({
    meta: [
      { title: "Service Providers · Vendor · SmatraPay" },
      { name: "description", content: "Technicians and installers working under your vendor account." },
      { property: "og:title", content: "Service Providers · Vendor · SmatraPay" },
      { property: "og:description", content: "Your installers and technicians with their current workload." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorServiceProviders,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

const PAGE_SIZE = 10;

function VendorServiceProviders() {
  const access = Route.useLoaderData();
  const fetchDirectory = useServerFn(getVendorDirectory);
  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor-directory"],
    queryFn: () => fetchDirectory(),
  });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const providers = data?.serviceProviders ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return providers.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (!needle) return true;
      return [p.name, p.phone, p.role, p.team_name].some((v) =>
        (v ?? "").toLowerCase().includes(needle),
      );
    });
  }, [providers, q, status]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DashboardShell
      access={access}
      title="Service providers"
      description="Installers and technicians attached to your installation teams."
      actions={
        <Link to="/vendor/teams" className="btn-primary px-4">
          Manage teams
        </Link>
      }
    >
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : providers.length === 0 ? (
        <EmptyState
          title="No service providers"
          message="Add members to an installation team and they will appear here."
        />
      ) : (
        <div className="space-y-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Providers" value={providers.length} />
            <StatCard label="Active" value={providers.filter((p) => p.status === "active").length} />
            <StatCard label="Open jobs" value={providers.reduce((s, p) => s + p.open_requests, 0)} />
            <StatCard label="Completed jobs" value={providers.reduce((s, p) => s + p.completed_requests, 0)} />
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
                placeholder="Search name, phone, role or team"
                aria-label="Search service providers"
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
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              className="btn-outline px-4 py-2 text-sm"
              onClick={() =>
                downloadCsv(
                  "vendor-service-providers.csv",
                  ["Name", "Role", "Team", "Phone", "Open jobs", "Completed jobs", "Status"],
                  rows.map((p) => [
                    p.name,
                    p.role,
                    p.team_name,
                    p.phone ?? "",
                    p.open_requests,
                    p.completed_requests,
                    p.status,
                  ]),
                )
              }
            >
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Team</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Open jobs</th>
                  <th className="px-4 py-2">Completed</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2 font-semibold">{p.name}</td>
                    <td className="px-4 py-2">{p.role}</td>
                    <td className="px-4 py-2">{p.team_name}</td>
                    <td className="px-4 py-2">{p.phone ?? "—"}</td>
                    <td className="px-4 py-2">{p.open_requests}</td>
                    <td className="px-4 py-2">{p.completed_requests}</td>
                    <td className="px-4 py-2">
                      <StatusBadge value={p.status} />
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        to="/vendor/teams/$teamId"
                        params={{ teamId: p.team_id }}
                        className="text-xs font-semibold text-primary"
                      >
                        Open team
                      </Link>
                    </td>
                  </tr>
                ))}
                {current.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No service providers match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onPage={setPage} total={rows.length} />
        </div>
      )}
    </DashboardShell>
  );
}
