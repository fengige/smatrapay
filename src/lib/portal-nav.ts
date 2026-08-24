import {
  LayoutDashboard,
  Users,
  Building2,
  Receipt,
  Wrench,
  Home,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
};

/** Sidebar items per portal. Only routes that exist are linked. */
export function navForRoles(roles: string[]): NavItem[] {
  if (roles.includes("admin")) {
    return [
      { label: "Overview", to: "/admin/dashboard", icon: LayoutDashboard },
      { label: "Users", to: "/users", icon: Users },
    ];
  }
  if (roles.includes("landlord")) {
    return [
      { label: "Overview", to: "/landlord/dashboard", icon: LayoutDashboard },
      { label: "Properties", to: "/landlord/dashboard", icon: Building2 },
    ];
  }
  if (roles.includes("vendor")) {
    return [
      { label: "Overview", to: "/vendor/dashboard", icon: LayoutDashboard },
      { label: "Invoices", to: "/vendor/dashboard", icon: Receipt },
    ];
  }
  if (roles.includes("agent")) {
    return [
      { label: "Overview", to: "/agent/dashboard", icon: LayoutDashboard },
      { label: "Listings", to: "/agent/dashboard", icon: BadgeCheck },
    ];
  }
  if (roles.includes("service_provider")) {
    return [
      { label: "Overview", to: "/service-provider/dashboard", icon: LayoutDashboard },
      { label: "Jobs", to: "/service-provider/dashboard", icon: Wrench },
    ];
  }
  return [{ label: "Overview", to: "/resident/dashboard", icon: Home }];
}
