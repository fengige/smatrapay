import {
  ArrowLeftRight,
  BadgeDollarSign,
  BarChart3,
  Briefcase,
  Building2,
  Cog,
  Gauge,
  Grid2x2,
  Home,
  KeyRound,
  MapPin,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  UserCheck,
  UserCircle,
  Users,
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
    {
      items: [
        { label: "Dashboard", to: dashboardForRoles(roles), icon: Grid2x2 },
        ...(roles.includes("admin")
          ? [
              { label: "POS", to: "/pos", icon: ShoppingCart },
              { label: "POS Shift Report", to: "/pos-shift-report", icon: Receipt },
            ]
          : []),
      ],
    },
  ];

  if (roles.includes("admin")) {
    groups.push(
      {
        heading: "TOKENS",
        items: [
          { label: "Token Management", icon: KeyRound, to: "/token-management" },
          { label: "Token Ledger", icon: Receipt, to: "/token-ledger" },
          { label: "Transaction Records", icon: ArrowLeftRight },
        ],
      },
      {
        heading: "MANAGEMENT",
        items: [
          { label: "Resident Management", icon: Users, to: "/residents" },
          { label: "Landlord Management", icon: Building2, to: "/landlords" },
          { label: "Property Management", icon: Home, to: "/properties" },
          { label: "Vendor Management", icon: Store, to: "/vendors" },
          { label: "Agent Management", icon: UserCheck, to: "/agents" },
          { label: "Service Provider", icon: Briefcase, to: "/service-providers" },
          { label: "User Management", to: "/users", icon: UserCircle },
        ],
      },
      {
        heading: "UNITS",
        items: [
          { label: "Meter Dashboard", icon: BarChart3, to: "/meter-dashboard" },
          { label: "Meter Management", icon: Gauge, to: "/meters" },
          { label: "Meter Suppliers", icon: Gauge, to: "/meter-suppliers" },
          { label: "Price Management", icon: BadgeDollarSign, to: "/price-management" },
          { label: "Zone Management", icon: MapPin, to: "/zones" },
        ],
      },

      {
        heading: "REPORTS",
        items: [{ label: "Reports & Analysis", icon: BarChart3 }],
      },
      {
        heading: "SETTINGS",
        items: [
          { label: "Account Settings", icon: Settings },
          { label: "Configurations", icon: Cog, to: "/admin/settings" },
        ],
      }
    );
  } else {
    groups.push({
      heading: "Account",
      items: [{ label: "Account Settings", icon: Settings }],
    });
  }

  return groups;
}

/** Flat list, kept for compatibility. */
export function navForRoles(roles: string[]): NavItem[] {
  return navGroupsForRoles(roles).flatMap((g) => g.items);
}
