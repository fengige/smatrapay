import { createFileRoute, Link } from "@tanstack/react-router";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  loader: () => checkRoleAccess({ data: { role: "admin" } }),
  component: AdminDashboard,
  errorComponent: () => <p className="p-8 text-sm">Could not load this dashboard.</p>,
});

function AdminDashboard() {
  const access = Route.useLoaderData();
  return (
    <DashboardShell
      access={access}
      title="Admin dashboard"
      description="Platform-wide oversight: users, portals, payments and compliance."
    >
      <div className="mt-8">
        <Link to="/users" className="btn-primary px-4">
          Manage users
        </Link>
      </div>
    </DashboardShell>
  );
}
