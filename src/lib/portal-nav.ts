import { LayoutDashboard, Users, type LucideIcon } from "lucide-react";
import { dashboardForRoles } from "./portals";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
};

export type NavGroup = {
  heading?: string;
  items: NavItem[];
};

/** Sidebar groups per portal. Only routes that actually exist are linked. */
export function navGroupsForRoles(roles: string[]): NavGroup[] {
  const groups: NavGroup[] = [
    { items: [{ label: "Dashboard", to: dashboardForRoles(roles), icon: LayoutDashboard }] },
  ];
  if (roles.includes("admin")) {
    groups.push({
      heading: "Management",
      items: [{ label: "User Management", to: "/users", icon: Users }],
    });
  }
  return groups;
}

/** Flat list, kept for compatibility. */
export function navForRoles(roles: string[]): NavItem[] {
  return navGroupsForRoles(roles).flatMap((g) => g.items);
}
