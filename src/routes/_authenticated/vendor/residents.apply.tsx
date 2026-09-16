import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, RefreshCw, Send, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { EmptyState, LoadingBlock } from "@/components/vendor/VendorUI";
import {
  type ApplicationDetails,
  getVendorApplication,
  listVendorApplications,
  sendVendorApplicationMessage,
  startVendorApplication,
} from "@/lib/vendor-applications.functions";

export const PREFILL_KEY = "vendor-resident-prefill";
export const PREFILL_APPLICATION_KEY = "vendor-resident-application";

export const Route = createFileRoute("/_authenticated/vendor/residents/apply")({
  head: () => ({
    meta: [
      { title: "Tenant Application Assistant · Vendor · SmatraPay" },
      {
        name: "description",
        content:
          "Chat with the SmatraPay assistant to capture a tenant application and pre-fill the Add Resident form.",
      },
      { property: "og:title", content: "Tenant Application Assistant · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Collect applicant details by chat, then review and submit them as a resident.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: TenantApplicationPage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

const FIELD_LABELS: [keyof ApplicationDetails, string][] = [
  ["first_name", "First name"],
  ["middle_name", "Middle name"],
  ["last_name", "Last name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["id_number", "ID number"],
  ["address", "Address"],
];

function TenantApplicationPage() {
  const access = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const listApplications = useServerFn(listVendorApplications);
  const fetchApplication = useServerFn(getVendorApplication);
  const startApplication = useServerFn(startVendorApplication);
  const sendMessage = useServerFn(sendVendorApplicationMessage);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const listQuery = useQuery({
    queryKey: ["vendor-applications"],
    queryFn: () => listApplications(),
  });

  const applications = listQuery.data?.applications ?? [];

  useEffect(() => {
    if (!activeId && applications.length > 0) setActiveId(applications[0]!.id);
  }, [activeId, applications]);

  const detailQuery = useQuery({
    queryKey: ["vendor-application", activeId],
    queryFn: () => fetchApplication({ data: { id: activeId as string } }),
    enabled: Boolean(activeId),
  });

  const application = detailQuery.data?.application ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [application?.messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId, application?.messages.length]);

  const startMutation = useMutation({
    mutationFn: () => startApplication(),
    onSuccess: async (res) => {
      setActiveId(res.application.id);
      await queryClient.invalidateQueries({ queryKey: ["vendor-applications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      sendMessage({ data: { id: activeId as string, message } }),
    onSuccess: async (res) => {
      queryClient.setQueryData(["vendor-application", activeId], {
        application: res.application,
      });
      await queryClient.invalidateQueries({ queryKey: ["vendor-applications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const message = input.trim();
    if (!message || !activeId || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(message);
  };

  const useDetails = () => {
    if (!application) return;
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify(application.details));
    sessionStorage.setItem(PREFILL_APPLICATION_KEY, application.id);
    navigate({ to: "/vendor/residents/new" });
  };

  const pending = sendMutation.isPending;
  const optimistic = pending ? sendMutation.variables : null;

  return (
    <DashboardShell
      access={access}
      title="Tenant Application Assistant"
      description="Answer a few questions and the assistant fills the Add Resident form for you"
    >
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_260px]">
        <aside className="space-y-2 rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Applications</h2>
            <button
              type="button"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {startMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              New
            </button>
          </div>
          {listQuery.isLoading ? (
            <LoadingBlock />
          ) : applications.length === 0 ? (
            <p className="px-1 py-6 text-xs text-muted-foreground">
              No applications yet. Start one to begin.
            </p>
          ) : (
            <ul className="space-y-1">
              {applications.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(a.id)}
                    className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      a.id === activeId
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="block font-semibold">
                      {[a.details.first_name, a.details.last_name].filter(Boolean).join(" ") ||
                        "Untitled applicant"}
                    </span>
                    <span className="block">{new Date(a.updated_at).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="flex min-h-[28rem] flex-col rounded-2xl border border-border bg-card">
          {!activeId ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                title="No application open"
                description="Start a new tenant application to chat with the assistant."
              />
            </div>
          ) : detailQuery.isLoading ? (
            <div className="p-6">
              <LoadingBlock />
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                {application?.messages.map((m, i) => (
                  <div
                    key={`${m.at}-${i}`}
                    className={m.role === "user" ? "flex justify-end" : "flex gap-2"}
                  >
                    {m.role === "assistant" && (
                      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Bot className="size-4" />
                      </span>
                    )}
                    <p
                      className={`max-w-[85%] whitespace-pre-wrap text-sm ${
                        m.role === "user"
                          ? "rounded-2xl bg-primary px-3.5 py-2 text-primary-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {m.content}
                    </p>
                  </div>
                ))}
                {optimistic && (
                  <div className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground opacity-70">
                      {optimistic}
                    </p>
                  </div>
                )}
                {pending && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Thinking…
                  </p>
                )}
                <div ref={endRef} />
              </div>

              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    rows={2}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    placeholder="Type the applicant's answer…"
                    className="min-h-[3rem] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending || !input.trim()}
                    className="inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
                    aria-label="Send message"
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-bold">Collected details</h2>
          <dl className="space-y-2">
            {FIELD_LABELS.map(([key, label]) => (
              <div key={key}>
                <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                  {label}
                </dt>
                <dd className="text-sm text-foreground">
                  {application?.details[key] || <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={useDetails}
            disabled={!application?.details.first_name || !application?.details.last_name}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <UserPlus className="size-4" /> Review in Add Resident
          </button>
          <Link
            to="/vendor/residents"
            className="block rounded-lg border border-border px-3 py-2 text-center text-sm"
          >
            Back to residents
          </Link>
        </aside>
      </div>
    </DashboardShell>
  );
}
