import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  Download,
  FileText,
  Home,
  Layers,
  Loader2,
  Search,
  UserCog,
  Users as UsersIcon,
} from "lucide-react";
import jsPDF from "jspdf";

import { listUsersByRole } from "@/lib/users.functions";
import { PortalLayout } from "@/components/PortalLayout";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  head: () => ({
    meta: [
      { title: "Property Details · SmatraPay" },
      {
        name: "description",
        content:
          "Property detail view with units, assigned residents, landlords and status audit history.",
      },
      { property: "og:title", content: "Property Details · SmatraPay" },
      {
        property: "og:description",
        content: "Units, residents, landlords and audit history for a SmatraPay property.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PropertyDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm">Property not found.</div>,
});

type Person = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  property: string | null;
  building: string | null;
  unit_number: string | null;
  move_in_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

const TABS = [
  { id: "units", label: "Units", icon: Layers },
  { id: "residents", label: "Residents", icon: UsersIcon },
  { id: "landlords", label: "Landlords", icon: Building2 },
  { id: "audit", label: "Status & Audit Logs", icon: ClipboardList },
] as const;

type TabId = (typeof TABS)[number]["id"];

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/12 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/12 text-destructive",
};

function fmtDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        statusTone[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

function PropertyDetailPage() {
  const { id } = Route.useParams();
  const propertyName = decodeURIComponent(id);
  const fetchByRole = useServerFn(listUsersByRole);
  const [tab, setTab] = useState<TabId>("units");
  const [query, setQuery] = useState("");

  const residentsQuery = useQuery({
    queryKey: ["users", "resident"],
    queryFn: () => fetchByRole({ data: { role: "resident" } }),
  });
  const landlordsQuery = useQuery({
    queryKey: ["users", "landlord"],
    queryFn: () => fetchByRole({ data: { role: "landlord" } }),
  });

  const isLoading = residentsQuery.isLoading || landlordsQuery.isLoading;

  const inProperty = (people: Person[]) =>
    people.filter((p) => (p.property ?? "").trim() === propertyName);

  const residents = useMemo(
    () => inProperty((residentsQuery.data?.users ?? []) as unknown as Person[]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [residentsQuery.data, propertyName],
  );
  const landlords = useMemo(
    () => inProperty((landlordsQuery.data?.users ?? []) as unknown as Person[]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [landlordsQuery.data, propertyName],
  );

  const units = useMemo(() => {
    const map = new Map<
      string,
      { unit: string; building: string; occupants: Person[]; moveIn: string | null }
    >();
    for (const person of residents) {
      const unit = (person.unit_number ?? "").trim() || "Unassigned";
      const row = map.get(unit) ?? {
        unit,
        building: (person.building ?? "").trim(),
        occupants: [],
        moveIn: null,
      };
      row.occupants.push(person);
      if (!row.building && person.building) row.building = person.building;
      if (person.move_in_date && (!row.moveIn || person.move_in_date < row.moveIn)) {
        row.moveIn = person.move_in_date;
      }
      map.set(unit, row);
    }
    return [...map.values()].sort((a, b) => a.unit.localeCompare(b.unit));
  }, [residents]);

  const auditEvents = useMemo(() => {
    const events: { date: string; actor: string; action: string; detail: string }[] = [];
    for (const person of [...residents, ...landlords]) {
      const who = person.name || person.email || person.id;
      events.push({
        date: person.created_at,
        actor: who,
        action: "Created",
        detail: `Account created and linked to ${propertyName}${
          person.unit_number ? ` · unit ${person.unit_number}` : ""
        }`,
      });
      if (person.move_in_date) {
        events.push({
          date: person.move_in_date,
          actor: who,
          action: "Moved in",
          detail: `Move-in recorded${person.unit_number ? ` for unit ${person.unit_number}` : ""}`,
        });
      }
      if (person.updated_at && person.updated_at !== person.created_at) {
        events.push({
          date: person.updated_at,
          actor: who,
          action: "Updated",
          detail: `Profile updated · status ${person.status}`,
        });
      }
    }
    return events.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [residents, landlords, propertyName]);

  const term = query.trim().toLowerCase();
  const match = (values: (string | null)[]) =>
    !term || values.filter(Boolean).join(" ").toLowerCase().includes(term);

  const visibleUnits = units.filter((u) =>
    match([u.unit, u.building, ...u.occupants.map((o) => o.name ?? o.email)]),
  );
  const visibleResidents = residents.filter((r) =>
    match([r.name, r.email, r.phone, r.unit_number, r.building]),
  );
  const visibleLandlords = landlords.filter((l) =>
    match([l.name, l.email, l.phone, l.building]),
  );
  const visibleAudit = auditEvents.filter((e) => match([e.actor, e.action, e.detail]));

  const exportRows = (): { header: string[]; rows: string[][]; name: string } => {
    if (tab === "units") {
      return {
        name: "units",
        header: ["Unit", "Building", "Occupants", "Earliest Move-in"],
        rows: visibleUnits.map((u) => [
          u.unit,
          u.building || "",
          u.occupants.map((o) => o.name || o.email || o.id).join(" | "),
          u.moveIn ?? "",
        ]),
      };
    }
    if (tab === "landlords") {
      return {
        name: "landlords",
        header: ["Name", "Email", "Phone", "Building", "Status"],
        rows: visibleLandlords.map((l) => [
          l.name ?? "",
          l.email ?? "",
          l.phone ?? "",
          l.building ?? "",
          l.status,
        ]),
      };
    }
    if (tab === "audit") {
      return {
        name: "audit-logs",
        header: ["Date", "Actor", "Action", "Detail"],
        rows: visibleAudit.map((e) => [fmtDate(e.date), e.actor, e.action, e.detail]),
      };
    }
    return {
      name: "residents",
      header: ["Name", "Email", "Phone", "Building", "Unit", "Move-in", "Status"],
      rows: visibleResidents.map((r) => [
        r.name ?? "",
        r.email ?? "",
        r.phone ?? "",
        r.building ?? "",
        r.unit_number ?? "",
        r.move_in_date ?? "",
        r.status,
      ]),
    };
  };

  const exportCsv = () => {
    const { header, rows, name } = exportRows();
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smatrapay-${slug(propertyName)}-${name}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const { header, rows, name } = exportRows();
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(15);
    doc.text(`${propertyName} — ${name.replace("-", " ")}`, 40, 44);
    doc.setFontSize(9);
    doc.text(`Exported ${new Date().toLocaleString()} · ${rows.length} records`, 40, 60);

    let y = 84;
    doc.setFontSize(9);
    doc.text(header.join("  |  "), 40, y);
    y += 14;
    for (const row of rows) {
      if (y > 540) {
        doc.addPage();
        y = 50;
      }
      const line = row.map((cell) => String(cell).slice(0, 40)).join("  |  ");
      doc.text(line.slice(0, 170), 40, y);
      y += 14;
    }
    doc.save(`smatrapay-${slug(propertyName)}-${name}.pdf`);
  };

  const stats = [
    { label: "Units", value: units.length, icon: Layers },
    { label: "Residents", value: residents.length, icon: UsersIcon },
    { label: "Landlords", value: landlords.length, icon: Building2 },
    {
      label: "Active Residents",
      value: residents.filter((r) => r.status === "active").length,
      icon: UserCog,
    },
  ];

  return (
    <PortalLayout
      roles={["admin"]}
      title={propertyName}
      description="Property details, units, occupants and audit history"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/properties"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <Download className="size-4" /> CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <FileText className="size-4" /> PDF
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Home className="size-6" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-foreground">{propertyName}</h2>
              <p className="text-xs text-muted-foreground">
                {[...new Set([...residents, ...landlords].map((p) => p.building).filter(Boolean))]
                  .join(", ") || "No buildings recorded"}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </p>
                  <s.icon className="size-4 text-muted-foreground" />
                </div>
                <p className="mt-1.5 text-2xl font-bold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent/10"
                }`}
              >
                <t.icon className="size-4" /> {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 border-b border-border p-4">
            <div className="flex min-w-[220px] flex-1 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
              <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                <Search className="size-4" />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search within this tab"
                className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground">
              <Loader2 className="mx-auto size-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              {tab === "units" && (
                <Table
                  head={["Unit", "Building", "Occupants", "Earliest Move-in"]}
                  empty={!visibleUnits.length}
                  emptyText="No units recorded for this property."
                >
                  {visibleUnits.map((u) => (
                    <tr key={u.unit} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold text-foreground">{u.unit}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.building || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.occupants.map((o) => o.name || o.email || o.id).join(", ")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.moveIn)}</td>
                    </tr>
                  ))}
                </Table>
              )}

              {tab === "residents" && (
                <Table
                  head={["Resident", "Phone", "Building", "Unit", "Move-in", "Status", ""]}
                  empty={!visibleResidents.length}
                  emptyText="No residents assigned to this property."
                >
                  {visibleResidents.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{r.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.email}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.phone || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.building || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.unit_number || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.move_in_date)}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/residents/$id"
                          params={{ id: r.id }}
                          search={{ page: 1, limit: 10 }}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}

              {tab === "landlords" && (
                <Table
                  head={["Landlord", "Phone", "Building", "Status", ""]}
                  empty={!visibleLandlords.length}
                  emptyText="No landlords linked to this property."
                >
                  {visibleLandlords.map((l) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{l.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{l.email}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{l.phone || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{l.building || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={l.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/landlords/$id"
                          params={{ id: l.id }}
                          search={{ page: 1, limit: 10 }}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}

              {tab === "audit" && (
                <Table
                  head={["Date", "Actor", "Action", "Detail"]}
                  empty={!visibleAudit.length}
                  emptyText="No audit events for this property."
                >
                  {visibleAudit.map((e, i) => (
                    <tr key={`${e.date}-${i}`} className="border-t border-border">
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(e.date)}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{e.actor}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                          {e.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.detail}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          )}
        </section>
      </div>
    </PortalLayout>
  );
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "property";
}

function Table({
  head,
  empty,
  emptyText,
  children,
}: {
  head: string[];
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <table className="w-full min-w-[820px] text-left text-sm">
      <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          {head.map((h, i) => (
            <th key={`${h}-${i}`} className="px-4 py-3 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {empty ? (
          <tr>
            <td colSpan={head.length} className="px-4 py-10 text-center text-muted-foreground">
              {emptyText}
            </td>
          </tr>
        ) : (
          children
        )}
      </tbody>
    </table>
  );
}
