import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FileText, Receipt, CreditCard, KeyRound, Bell, Headset, MessageSquareHeart, ShieldCheck, Landmark, BadgeDollarSign, Home } from "lucide-react";

const paymentLinks = [
  { to: "/resident/transactions", title: "Payment history & receipts", detail: "Utility payments and confirmed tokens", icon: Receipt },
  { to: "/resident/buy-tokens", title: "Buy utility tokens", detail: "Pay with your configured M-Pesa service", icon: KeyRound },
  { to: "/resident/statements", title: "Token statements", detail: "Date filters, CSV download and print", icon: FileText },
  { to: "/resident/bills", title: "Rent & invoices", detail: "Not available yet", icon: CreditCard },
] as const;
const moreLinks = [
  { to: "/resident/meters", title: "My homes", detail: "Units, leases and assigned meters", icon: Home },
  { to: "/resident/documents", title: "Documents", detail: "Document sharing is not available yet", icon: FileText },
  { to: "/resident/notifications", title: "Notifications", detail: "Your account and service updates", icon: Bell },
  { to: "/resident/support", title: "Help & support", detail: "Resident assistant and support enquiries", icon: Headset },
  { to: "/resident/feedback", title: "Feedback", detail: "Share your experience", icon: MessageSquareHeart },
  { to: "/resident/insurance", title: "Insurance enquiry", detail: "Contact staff · not a policy purchase", icon: ShieldCheck },
  { to: "/resident/loans", title: "Loan enquiry", detail: "Contact staff · not a loan application", icon: BadgeDollarSign },
  { to: "/resident/sacco", title: "Sacco enquiry", detail: "Contact staff about Sacco services", icon: Landmark },
] as const;
export function ResidentFeatureLinks({ kind }: { kind: "payments" | "more" }) {
  return <div className="grid gap-3 sm:grid-cols-2">{(kind === "payments" ? paymentLinks : moreLinks).map(({ to, title, detail, icon: Icon }) => <Link to={to} key={to} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary">
    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Icon className="size-5" /></span><span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></span><ArrowUpRight className="size-4 text-muted-foreground" />
  </Link>)}</div>;
}