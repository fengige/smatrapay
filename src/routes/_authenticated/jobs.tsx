import { createFileRoute } from "@tanstack/react-router";
import { PortalLayout } from "@/components/PortalLayout";
import { JobsView } from "@/components/JobsView";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Jobs · Admin · SmatraPay" },
      { name: "description", content: "Search, filter and assign service requests to service providers." },
      { property: "og:title", content: "Jobs · Admin · SmatraPay" },
      { property: "og:description", content: "All service request jobs across vendors with provider assignment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <PortalLayout roles={["admin"]} title="Jobs" description="Search, filter and assign service requests to service providers">
      <JobsView mode="admin" />
    </PortalLayout>
  ),
});
