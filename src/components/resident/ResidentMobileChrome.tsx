import { Link, useRouterState, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, CreditCard, Gauge, Headset, Home, MoreHorizontal, UserRound, WifiOff, Wrench } from "lucide-react";
import logo from "@/assets/logo.png";
import { ResidentAvatar } from "./ResidentAvatar";
import { Button } from "@/components/ui/button";
import { residentMobileTab } from "@/lib/resident-mobile";

const tabs = [
  { label: "Home", to: "/resident/dashboard", icon: Home },
  { label: "Payments", to: "/resident/payments", icon: CreditCard },
  { label: "Utilities", to: "/resident/meters", icon: Gauge },
  { label: "Requests", to: "/resident/jobs", icon: Wrench },
  { label: "Account", to: "/resident/profile", icon: UserRound },
] as const;

export function ResidentMobileHeader({ title, name, photo, unread, actions }: { title: string; name: string; photo: string | null; unread: number; actions?: React.ReactNode }) {
  return <header className="resident-mobile-header sticky top-0 z-30 border-b border-border bg-background lg:hidden">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-2">
      <Link to="/resident/dashboard" className="min-w-0"><img src={logo} alt="SmatraPay" className="h-6 w-auto max-w-full" /></Link>
      <div className="flex shrink-0 items-center gap-1">
        <Button asChild variant="ghost" size="icon" className="size-11"><Link to="/resident/support" aria-label="Ask Resident Support"><Headset /></Link></Button>
        <Button asChild variant="ghost" size="icon" className="relative size-11"><Link to="/resident/notifications" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}><Bell />{unread > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" />}</Link></Button>
        <Button asChild variant="ghost" size="icon" className="size-11"><Link to="/resident/profile" aria-label="My Profile"><ResidentAvatar name={name} photo={photo} size="menu" /></Link></Button>
      </div>
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 pb-3">
      <p className="min-w-0 truncate text-sm font-bold">{title}</p>
      <Button asChild variant="ghost" className="h-11 px-2"><Link to="/resident/more"><MoreHorizontal />More</Link></Button>
      {actions && <div className="col-span-2 flex flex-wrap gap-2">{actions}</div>}
    </div>
  </header>;
}

export function ResidentMobileNavigation() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = residentMobileTab(pathname);
  return <nav aria-label="Resident mobile navigation" className="resident-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card lg:hidden">
    {tabs.map(({ label, to, icon: Icon }) => <Link key={label} to={to} aria-current={label === current ? "page" : undefined} className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 text-[0.65rem] font-semibold ${label === current ? "text-primary" : "text-muted-foreground"}`}><Icon className="size-5" /><span>{label}</span></Link>)}
  </nav>;
}

export function useResidentConnection() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

export function ResidentConnectionBanner() {
  const online = useResidentConnection();
  const qc = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("resident-") }); void router.invalidate(); };
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, [qc, router]);
  return online ? null : <div role="status" className="flex items-start gap-2 border-b border-border bg-muted px-4 py-3 text-sm"><WifiOff className="mt-0.5 size-4 shrink-0" /><p>You’re offline. Connect to refresh your account, make payments or save changes.</p></div>;
}