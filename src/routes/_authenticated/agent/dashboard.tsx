import { createFileRoute } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";

export const Route = createFileRoute("/_authenticated/agent/dashboard")({
  head: () => ({ meta: [{ title: "Agent Dashboard · SmatraPay" }, { name: "description", content: "Your SmatraPay agent dashboard." }, { property: "og:title", content: "Agent Dashboard · SmatraPay" }, { property: "og:description", content: "Your SmatraPay agent dashboard." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: () => checkRoleAccess({ data: { role: "agent" } }),
  component: AgentDashboard,
  errorComponent: () => <p className="p-8 text-sm">Could not load this dashboard.</p>,
});

function AgentDashboard() {
  return (
    <DashboardShell
      access={Route.useLoaderData()}
      title="Agent dashboard"
      description="Follow listings, leads and commission payouts."
    />
  );
}
