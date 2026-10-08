import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { JobsView } from "@/components/JobsView";

export const Route = createFileRoute("/_authenticated/service-provider/jobs")({
  head: () => ({
    meta: [
      { title: "My Jobs · Service Provider · SmatraPay" },
      { name: "description", content: "Jobs assigned to you by vendors and admins." },
      { property: "og:title", content: "My Jobs · Service Provider · SmatraPay" },
      { property: "og:description", content: "Your assigned service request jobs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "service_provider" } }),
  component: MyJobs,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

function MyJobs() {
  return (
    <DashboardShell access={Route.useLoaderData()} title="My Jobs" description="Jobs assigned to you.">
      <JobsView mode="provider" />
    </DashboardShell>
  );
}
