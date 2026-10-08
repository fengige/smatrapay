import {
  ArrowLeftRight,
  BadgeDollarSign,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  ClipboardList,
  HardHat,
  Power,
  Wrench,
  Cog,
  Cpu,
  CreditCard,
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
  Bot,
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
          { label: "Bank Payments", icon: Receipt, to: "/bank-payments" },
          { label: "Vending Performance", icon: BarChart3, to: "/vending-dashboard" },
          { label: "Transaction Records", icon: ArrowLeftRight, to: "/transaction-records" },
        ],
      },
      {
        heading: "MANAGEMENT",
        items: [
          { label: "Resident Management", icon: Users, to: "/residents" },
          { label: "Landlord Management", icon: Building2, to: "/landlords" },
          { label: "Property Management", icon: Home, to: "/properties" },
          { label: "Vendor Management", icon: Store, to: "/vendors" },
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
          { label: "Vending Software", icon: Cpu, to: "/vending-software" },
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
          { label: "Configurations", icon: Cog, to: "/configurations/app-settings" },
          { label: "Payment Methods", icon: CreditCard, to: "/payment-methods" },
          { label: "Payment History", icon: Receipt, to: "/payment-history" },
        ],
      }
    );
  } else if (roles.includes("vendor")) {
    groups[0]!.items.push(
      { label: "POS", to: "/vendor/pos", icon: ShoppingCart },
      { label: "POS Shift Report", to: "/vendor/pos-shift-report", icon: Receipt },
    );
    groups.push(
      {
        heading: "TOKENS",
        items: [
          { label: "Token Management", icon: KeyRound, to: "/vendor/token-management" },
          { label: "Token Ledger", icon: Receipt, to: "/vendor/token-ledger" },
          { label: "Vendor Transactions", icon: ArrowLeftRight, to: "/vendor/transactions" },
        ],
      },
      {
        heading: "MANAGEMENT",
        items: [
          { label: "Resident Management", icon: Users, to: "/vendor/residents" },
          { label: "Tenant Application AI", icon: Bot, to: "/vendor/residents/apply" },
          { label: "Landlord Management", icon: Building2, to: "/vendor/landlords" },
          { label: "Property Management", icon: Home, to: "/vendor/properties" },
          { label: "Service Provider", icon: Briefcase, to: "/vendor/service-providers" },
        ],
      },
      {
        heading: "UNITS",
        items: [
          { label: "Meter Management", icon: Gauge, to: "/vendor/meters" },
          { label: "Meter Suppliers", icon: Gauge, to: "/vendor/meter-suppliers" },
          { label: "Price Management", icon: BadgeDollarSign, to: "/vendor/price-management" },
          { label: "Zone Management", icon: MapPin, to: "/vendor/zones" },
          { label: "Meter Assignments", icon: ArrowLeftRight, to: "/vendor/assignments" },
        ],
      },
      {
        heading: "PREPAID METER OPERATIONS",
        items: [
          { label: "Meter Activation", icon: Power, to: "/vendor/activation" },
          { label: "Token & Payments", icon: CreditCard, to: "/vendor/tokens" },
          { label: "Meter Readings", icon: ClipboardList, to: "/vendor/readings" },
          { label: "Maintenance / Service", icon: Wrench, to: "/vendor/service-requests" },
          { label: "Installation Teams", icon: HardHat, to: "/vendor/teams" },
        ],
      },
      {
        heading: "INSIGHTS",
        items: [
          { label: "Reports", icon: BarChart3, to: "/vendor/reports" },
          { label: "Notifications", icon: Bell, to: "/vendor/notifications" },
        ],
      },
      {
        heading: "ACCOUNT",
        items: [{ label: "My Profile", icon: UserCircle, to: "/vendor/profile" }],
      },
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
