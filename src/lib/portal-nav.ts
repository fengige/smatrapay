import {
  Activity,
  Building2,
  Cog,
  Gauge,
  Grid2x2,
  KeyRound,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCircle,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { dashboardForRoles } from "./portals";

export type NavItem = {
  label: string;
  /** Omitted for sections that do not have a route yet. */
  to?: string;
  icon: LucideIcon;
};

export type NavGroup = {
  heading?: string;
  items: NavItem[];
};

/** Sidebar groups per portal. Items without `to` are placeholders. */
export function navGroupsForRoles(roles: string[]): NavGroup[] {
  const groups: NavGroup[] = [
    { items: [{ label: "Dashboard", to: dashboardForRoles(roles), icon: Grid2x2 }] },
  ];

  if (roles.includes("admin")) {
    groups.push(
      {
        heading: "Management",
        items: [
          { label: "Vending Control", icon: Activity },
          { label: "Vendor Management", icon: Building2 },
          { label: "Account Approvals", icon: ShieldCheck },
          { label: "Landlord Management", icon: LayoutDashboard },
          { label: "Location Hierarchy", icon: MapPin },
          { label: "Assigned Meters", icon: Users },
          { label: "Meter Management", icon: Gauge },
          { label: "Token Management", icon: KeyRound },
        ],
      },
      {
        heading: "System",
        items: [
          { label: "Roles & Permissions", icon: ShieldCheck },
          { label: "System Logs", icon: ScrollText },
          { label: "System Configuration", icon: SlidersHorizontal },
          { label: "Callback Settings", icon: Webhook },
          { label: "Public Enquiries", icon: MessageSquare },
        ],
      },
      {
        heading: "Account",
        items: [
          { label: "Users", to: "/users", icon: UserCircle },
          { label: "Account Settings", icon: Settings },
        ],
      },
    );
  } else {
    groups.push({
      heading: "Account",
      items: [{ label: "Account Settings", icon: Cog }],
    });
  }

  return groups;
}

/** Flat list, kept for compatibility. */
export function navForRoles(roles: string[]): NavItem[] {
  return navGroupsForRoles(roles).flatMap((g) => g.items);
}
