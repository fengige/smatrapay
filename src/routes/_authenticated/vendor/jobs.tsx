import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { JobsView } from "@/components/JobsView";

export const Route = createFileRoute("/_authenticated/vendor/jobs")({
  head: () => ({
    meta: [
      { title: "Jobs · Vendor · SmatraPay" },
      { name: "description", content: "Assign your service requests to service providers." },
      { property: "og:title", content: "Jobs · Vendor · SmatraPay" },
      { property: "og:description", content: "Your service request jobs and their assigned service providers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorJobs,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

function VendorJobs() {
  return (
    <DashboardShell access={Route.useLoaderData()} title="Jobs" description="Assign your service requests to service providers.">
      <JobsView mode="vendor" />
    </DashboardShell>
  );
}
