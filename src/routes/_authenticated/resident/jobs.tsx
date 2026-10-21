import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { JobsView } from "@/components/JobsView";

export const Route = createFileRoute("/_authenticated/resident/jobs")({
  head: () => ({ meta: [
    { title: "Customer Jobs · SmatraPay" },
    { name: "description", content: "Your service requests, current status and service provider updates in SmatraPay." },
    { property: "og:title", content: "Customer Jobs · SmatraPay" },
    { property: "og:description", content: "Your service requests and provider updates." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: CustomerJobs,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function CustomerJobs() {
  return <DashboardShell access={Route.useLoaderData()} title="Customer Jobs">
    <JobsView mode="customer" />
  </DashboardShell>;
}