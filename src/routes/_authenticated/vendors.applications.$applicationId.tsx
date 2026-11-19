import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PortalLayout } from "@/components/PortalLayout";
import {
  getRegistrationApplication,
  reviewRegistrationApplication,
  retryRegistrationNotifications,
} from "@/lib/vendor-registration.functions";
export const Route = createFileRoute("/_authenticated/vendors/applications/$applicationId")({
  head: () => ({
    meta: [
      { title: "Vendor Application Review · SmatraPay" },
      {
        name: "description",
        content:
          "Review a private SmatraPay vendor application and track account setup notifications.",
      },
      { property: "og:title", content: "Vendor Application Review · SmatraPay" },
      {
        property: "og:description",
        content: "Administrator vendor application review and notification history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplicationDetails,
});
function ApplicationDetails() {
  const { applicationId: id } = Route.useParams();
  const load = useServerFn(getRegistrationApplication);
  const review = useServerFn(reviewRegistrationApplication);
  const retry = useServerFn(retryRegistrationNotifications);
  const qc = useQueryClient();
  const [decision, setDecision] = useState<"Accepted" | "Rejected" | null>(null);
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: ["vendor-registration", id],
    queryFn: () => load({ data: { id } }),
    refetchInterval: 30000,
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["vendor-registration", id] }),
      qc.invalidateQueries({ queryKey: ["vendor-registrations"] }),
      qc.invalidateQueries({ queryKey: ["users", "vendor"] }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: () => {
      if (!decision) throw new Error("Choose a decision");
      return review({ data: { id, decision, reason } });
    },
    onSuccess: async () => {
      setDecision(null);
      toast.success("Decision saved. Check email and SMS outcomes below.");
      await refresh();
    },
    onError: async (e: Error) => {
      toast.error(e.message);
      await refresh();
    },
  });
  const retryMutation = useMutation({
    mutationFn: () => retry({ data: { id } }),
    onSuccess: async () => {
      toast.success("Notification attempts recorded");
      await refresh();
    },
    onError: async (e: Error) => {
      toast.error(e.message);
      await refresh();
    },
  });
  const a = query.data?.application;
  return (
    <PortalLayout
      roles={["admin"]}
      title="Vendor Application"
      description={a?.reference ?? "Application review"}
    >
      <Button asChild variant="outline">
        <Link to="/vendors" search={{ page: 1, limit: 10, status: "all", q: "" }}>
          Back to vendors
        </Link>
      </Button>
      {query.isPending ? (
        <p className="mt-6">Loading application…</p>
      ) : query.error ? (
        <div role="alert" className="mt-6">
          <p className="text-destructive">{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Retry</Button>
        </div>
      ) : (
        a && (
          <div className="mt-6 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{a.business_name}</h2>
                <p className="mt-2 font-semibold text-primary">{a.status}</p>
              </div>
              {a.status === "Pending" && (
                <div className="flex gap-3">
                  <Button disabled={mutation.isPending} onClick={() => setDecision("Accepted")}>
                    Accept
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={mutation.isPending || Boolean(a.vendor_user_id)}
                    onClick={() => setDecision("Rejected")}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
            <dl className="grid gap-5 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Reference", a.reference],
                ["Business type", a.business_type],
                ["Registration number", a.registration_number],
                ["Contact person", a.contact_name],
                ["Email", a.email],
                ["Phone", a.phone],
                ["Location", a.location],
                ["Services", a.services.join(", ")],
                ["About the business", a.description],
                ["Contact preference", a.contact_preference],
                ["Declaration", a.consent ? "Confirmed" : "Not confirmed"],
                [
                  "Submitted",
                  new Date(a.submitted_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }),
                ],
                [
                  "Reviewed",
                  a.reviewed_at
                    ? new Date(a.reviewed_at).toLocaleString("en-KE", {
                        timeZone: "Africa/Nairobi",
                      })
                    : "Not reviewed",
                ],
                ["Reviewer ID", a.reviewed_by],
                ["Vendor account ID", a.vendor_user_id],
                ["Rejection reason", a.rejection_reason],
              ].map(([k, v]) => (
                <div className="min-w-0" key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-1 break-words text-sm">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {a.status !== "Pending" && (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold">Notifications</h3>
                <p>
                  Email: <strong>{a.email_status}</strong> · SMS: <strong>{a.sms_status}</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  Sent means submitted to the provider, not confirmed delivery. Failed channels can
                  be retried without creating another account. Sending or uncertain outcomes require
                  checking message history first.
                </p>
                {[a.email_status, a.sms_status].some((s) => s === "failed" || s === "not_sent") && (
                  <Button
                    variant="outline"
                    disabled={retryMutation.isPending}
                    onClick={() => retryMutation.mutate()}
                  >
                    {retryMutation.isPending ? "Retrying…" : "Retry failed notifications"}
                  </Button>
                )}
              </section>
            )}
            <section>
              <h3 className="mb-4 text-lg font-semibold">Review & notification history</h3>
              <ol className="space-y-4">
                <li className="border-l-2 border-accent pl-4 text-sm">
                  Application submitted ·{" "}
                  {new Date(a.submitted_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}
                </li>
                {query.data?.events.map((e) => (
                  <li key={e.id} className="border-l-2 border-border pl-4 text-sm">
                    <strong>{e.event_type}</strong>
                    <p className="text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("en-KE", {
                        timeZone: "Africa/Nairobi",
                      })}{" "}
                      · {e.actor_id ?? "System"}
                    </p>
                    {e.detail && <p className="mt-1">{e.detail}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )
      )}
      <Dialog
        open={Boolean(decision)}
        onOpenChange={(v) => {
          if (!v && !mutation.isPending) setDecision(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "Accepted"
                ? "Accept vendor application?"
                : "Reject vendor application?"}
            </DialogTitle>
            <DialogDescription>
              {decision === "Accepted"
                ? "This creates a vendor account and sends secure password setup instructions to the submitted email and phone."
                : "A reason is required and will be sent to the applicant by email and SMS."}
            </DialogDescription>
          </DialogHeader>
          {decision === "Rejected" && (
            <div className="space-y-2">
              <label htmlFor="rejection-reason">Rejection reason</label>
              <textarea
                id="rejection-reason"
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background p-3"
              />
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setDecision(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending || (decision === "Rejected" && reason.trim().length < 3)}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Processing…" : "Confirm decision"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
