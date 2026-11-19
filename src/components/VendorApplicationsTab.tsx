import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listRegistrationApplications } from "@/lib/vendor-registration.functions";
export function VendorApplicationsTab() {
  const load = useServerFn(listRegistrationApplications);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"All" | "Pending" | "Accepted" | "Rejected">("All");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const query = useQuery({
    queryKey: ["vendor-registrations", q, status, page, limit],
    queryFn: () => load({ data: { q, status, page, limit } }),
    refetchInterval: 30000,
  });
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search vendor applications"
          placeholder="Search business, name, email or phone"
          maxLength={100}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <select
          aria-label="Application status"
          value={status}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "All" || v === "Pending" || v === "Accepted" || v === "Rejected")
              setStatus(v);
            setPage(1);
          }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {["All", "Pending", "Accepted", "Rejected"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh applications"
          onClick={() => void query.refetch()}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      {query.isPending ? (
        <p role="status">Loading applications…</p>
      ) : query.error ? (
        <div role="alert">
          <p className="text-destructive">{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-border bg-muted">
                <tr>
                  {[
                    "Business / reference",
                    "Contact person",
                    "Email",
                    "Phone",
                    "Status",
                    "Submitted",
                    "Messages",
                    "Actions",
                  ].map((s) => (
                    <th className="p-3 font-medium" key={s}>
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.rows.length ? (
                  query.data.rows.map((a) => (
                    <tr key={a.id} className="border-b border-border">
                      <td className="p-3 font-medium">
                        {a.business_name}
                        <span className="block text-xs text-muted-foreground">{a.reference}</span>
                      </td>
                      <td className="p-3">{a.contact_name}</td>
                      <td className="p-3">{a.email}</td>
                      <td className="p-3">{a.phone}</td>
                      <td className="p-3">{a.status}</td>
                      <td className="p-3 whitespace-nowrap">
                        {new Date(a.submitted_at).toLocaleDateString("en-KE", {
                          timeZone: "Africa/Nairobi",
                        })}
                      </td>
                      <td className="p-3 text-xs">
                        Email: {a.email_status}
                        <br />
                        SMS: {a.sms_status}
                      </td>
                      <td className="p-3">
                        <Button asChild size="icon" variant="outline">
                          <Link
                            to="/vendors/applications/$applicationId"
                            params={{ applicationId: a.id }}
                            search={{ page: 1, limit: 10 }}
                            aria-label={`View ${a.business_name} application`}
                          >
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      No applications found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <label htmlFor="application-limit">Rows per page</label>
              <select
                id="application-limit"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-input bg-background p-2"
              >
                {[10, 25, 50].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              <span>{query.data.total} applications</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous application page"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              Page {page} of {Math.max(1, Math.ceil(query.data.total / limit))}
              <Button
                variant="outline"
                size="icon"
                aria-label="Next application page"
                disabled={page * limit >= query.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
