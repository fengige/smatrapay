export const PORTALS = [
  {
    id: "admin",
    label: "Admin",
    role: "admin",
    dashboard: "/admin/dashboard",
    blurb: "Full platform control",
  },
  {
    id: "landlord",
    label: "Landlord",
    role: "landlord",
    dashboard: "/landlord/dashboard",
    blurb: "Properties & tenants",
  },
  {
    id: "vendor",
    label: "Vendor",
    role: "vendor",
    dashboard: "/vendor/dashboard",
    blurb: "Orders & invoices",
  },
  {
    id: "agent",
    label: "Agent",
    role: "agent",
    dashboard: "/agent/dashboard",
    blurb: "Listings & leads",
  },
  {
    id: "service-provider",
    label: "Service Provider",
    role: "service_provider",
    dashboard: "/service-provider/dashboard",
    blurb: "Jobs & maintenance",
  },
] as const;

export type PortalId = (typeof PORTALS)[number]["id"];
export type AppRole =
  | "admin"
  | "landlord"
  | "vendor"
  | "agent"
  | "service_provider"
  | "resident"
  | "moderator"
  | "user";

export const RESIDENT_DASHBOARD = "/resident/dashboard";

export function portalById(id: string) {
  return PORTALS.find((p) => p.id === id);
}

export function dashboardForRoles(roles: string[]): string {
  for (const portal of PORTALS) {
    if (roles.includes(portal.role)) return portal.dashboard;
  }
  return RESIDENT_DASHBOARD;
}

export function roleLabel(role: string): string {
  const portal = PORTALS.find((p) => p.role === role);
  if (portal) return portal.label;
  if (role === "resident") return "Resident";
  return role.charAt(0).toUpperCase() + role.slice(1);
}
