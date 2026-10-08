import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ArrowUpDown,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
} from "lucide-react";

import { PortalLayout } from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { listServiceProviders } from "@/lib/service-providers.functions";
import { providerActions } from "@/lib/service-provider-schema";
import {
  ProviderAvatar,
  StatusPill,
  useProviderActions,
} from "@/components/service-providers/ProviderUI";

const LIMIT_OPTIONS = [10, 25, 50, 100];

function parseSearch(search: Record<string, unknown>) {
  const page = Math.max(1, Number(search["page"]) || 1);
  const limit = LIMIT_OPTIONS.includes(Number(search["limit"])) ? Number(search["limit"]) : 10;
  return { page, limit };
}

export const Route = createFileRoute("/_authenticated/service-providers/")({
  validateSearch: parseSearch,
  head: () => ({
    meta: [
      { title: "Service Provider Management · SmatraPay" },
      {
        name: "description",
        content: "Manage SmatraPay service providers, their services, jobs and account status.",
      },
      { property: "og:title", content: "Service Provider Management · SmatraPay" },
      {
        property: "og:description",
        content: "View, search, suspend and manage every service provider on SmatraPay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServiceProvidersPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{(error as Error).message}</div>
  ),
});

type SortKey = "name" | "email" | "phone" | "status" | "created_at";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ServiceProvidersPage() {
  const fetchList = useServerFn(listServiceProviders);
  const { page, limit } = Route.useSearch();
  const navigate = useNavigate({ from: "/service-providers/" });
  const setPage = (p: number) => navigate({ search: (prev) => ({ ...prev, page: p }) });

  const [q, setQ] = useState("");
  const [service, setService] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const dq = useDebounced(q);
  const dservice = useDebounced(service);

  useEffect(() => {
    if (page !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, dservice, status]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["service-providers", { dq, dservice, status, page, limit, sortBy, sortDir }],
    queryFn: () =>
      fetchList({
        data: {
          q: dq || undefined,
          service: dservice || undefined,
          status: status === "all" ? undefined : status,
          page,
          limit,
          sortBy,
          sortDir,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const { run, dialog, busy } = useProviderActions();
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  const toggleSort = (k: SortKey) => {
    if (sortBy === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(k);
      setSortDir("asc");
    }
  };

  const cards = [
    {
      label: "Total Providers",
      value: data?.counts.total,
      icon: Briefcase,
      tone: "bg-primary/12 text-primary",
    },
    {
      label: "Active",
      value: data?.counts.active,
      icon: UserCheck,
      tone: "bg-accent/12 text-accent",
    },
    {
      label: "Suspended",
      value: data?.counts.suspended,
      icon: ShieldAlert,
      tone: "bg-destructive/12 text-destructive",
    },
  ];

  const addButton = (
    <Button asChild>
      <Link to="/service-providers/new">
        <Plus /> Add Service Provider
      </Link>
    </Button>
  );

  const SortTh = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 uppercase"
      >
        {label} <ArrowUpDown className={`size-3 ${sortBy === k ? "text-primary" : "opacity-50"}`} />
      </button>
    </th>
  );

  return (
    <PortalLayout
      roles={["admin"]}
      title="Service Provider Management"
      description="Manage service providers, their services and jobs"
      actions={<div className="hidden md:block">{addButton}</div>}
    >
      {dialog}
      <div className="space-y-5 pt-3">
        <div className="flex justify-end md:hidden">{addButton}</div>
        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
              <span className={`flex size-10 items-center justify-center rounded-xl ${c.tone}`}>
                <c.icon className="size-5" />
              </span>
              <p className="mt-4 text-3xl font-extrabold text-foreground">
                {isLoading ? "—" : (c.value ?? 0)}
              </p>
              <p className="text-sm text-muted-foreground">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
            <div className="input-shell flex w-full max-w-sm items-center gap-2">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                className="input-field min-w-0"
                placeholder="Search name, email or phone…"
                aria-label="Search service providers"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Filter by service…"
              aria-label="Filter by service"
              value={service}
              onChange={(e) => setService(e.target.value)}
            />
            <select
              aria-label="Filter by status"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {error ? (
            <div className="p-8 text-center text-sm">
              <p className="text-destructive">{(error as Error).message}</p>
              <Button variant="outline" className="mt-3" onClick={() => refetch()}>
                Refresh
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className={`w-full min-w-[980px] text-left text-sm ${isFetching ? "opacity-70" : ""}`}
              >
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <SortTh k="name" label="Service Provider" />
                    <SortTh k="phone" label="Phone" />
                    <SortTh k="email" label="Email" />
                    <th className="px-4 py-3">Services Offered</th>
                    <th className="px-4 py-3">Total Jobs</th>
                    <SortTh k="status" label="Status" />
                    <SortTh k="created_at" label="Date Added" />
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                        Loading service providers…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                        No service providers found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r: any) => {
                      const actions = providerActions(r.status);
                      const target = { id: r.id, name: r.name, email: r.email };
                      return (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ProviderAvatar src={r.profile_image || r.logo_url} name={r.name} />
                              <div>
                                <Link
                                  to="/service-providers/$id"
                                  params={{ id: r.id }}
                                  className="font-semibold text-foreground hover:text-primary"
                                >
                                  {r.name || "—"}
                                </Link>
                                {r.business_name && (
                                  <p className="text-xs text-muted-foreground">{r.business_name}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">{r.phone || "—"}</td>
                          <td className="px-4 py-3">{r.email || "—"}</td>
                          <td className="px-4 py-3">
                            {r.services.length ? (
                              <div className="flex max-w-[220px] flex-wrap gap-1">
                                {r.services.slice(0, 3).map((s: string) => (
                                  <span
                                    key={s}
                                    className="rounded-md bg-secondary px-2 py-0.5 text-xs"
                                  >
                                    {s}
                                  </span>
                                ))}
                                {r.services.length > 3 && (
                                  <span className="text-xs text-muted-foreground">
                                    +{r.services.length - 3}
                                  </span>
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">{r.total_jobs}</td>
                          <td className="px-4 py-3">
                            <StatusPill status={r.status} />
                          </td>
                          <td className="px-4 py-3">
                            {new Date(r.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" asChild title="View">
                                <Link
                                  to="/service-providers/$id"
                                  params={{ id: r.id }}
                                  aria-label="View"
                                >
                                  <Eye />
                                </Link>
                              </Button>
                              <Button variant="ghost" size="icon" asChild title="Edit">
                                <Link
                                  to="/service-providers/$id/edit"
                                  params={{ id: r.id }}
                                  aria-label="Edit"
                                >
                                  <Pencil />
                                </Link>
                              </Button>
                              {actions.includes("suspend") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Suspend"
                                  aria-label="Suspend"
                                  disabled={busy}
                                  onClick={() => run("suspend", target)}
                                >
                                  <Pause />
                                </Button>
                              )}
                              {actions.includes("unsuspend") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Unsuspend"
                                  aria-label="Unsuspend"
                                  disabled={busy}
                                  onClick={() => run("unsuspend", target)}
                                >
                                  <Play />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Delete"
                                aria-label="Delete"
                                className="text-destructive"
                                disabled={busy}
                                onClick={() => run("delete", target)}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                Showing {total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, total)} of{" "}
                {total}
              </span>
              <select
                aria-label="Rows per page"
                className="rounded-lg border border-border bg-background px-2 py-1"
                value={limit}
                onChange={(e) => navigate({ search: { page: 1, limit: Number(e.target.value) } })}
              >
                {LIMIT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft />
              </Button>
              <span>
                Page {page} / {pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
