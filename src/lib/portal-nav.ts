import { LayoutDashboard, Users, type LucideIcon } from "lucide-react";
import { dashboardForRoles } from "./portals";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
};

/** Sidebar items per portal. Only routes that actually exist are linked. */
export function navForRoles(roles: string[]): NavItem[] {
  const items: NavItem[] = [
    { label: "Overview", to: dashboardForRoles(roles), icon: LayoutDashboard },
  ];
  if (roles.includes("admin")) {
    items.push({ label: "Users", to: "/users", icon: Users });
  }
  return items;
}
