import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export const residentHead = (title: string, description: string) => () => ({
  meta: [
    { title: `${title} · SmatraPay Resident` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} · SmatraPay Resident` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});

export const kes = (n: number | null | undefined) =>
  n == null ? "—" : `KES ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const when = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "—";
export const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-KE") : "—");

export const field =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, to }: { label: string; value: ReactNode; hint?: string; to?: string }) {
  const body = (
    <div className="h-full rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return to ? <Link to={to as never}>{body}</Link> : body;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

const TONE: Record<string, string> = {
  vended: "bg-primary/10 text-primary",
  active: "bg-primary/10 text-primary",
  payment_failed: "bg-destructive/10 text-destructive",
  vend_failed: "bg-accent text-accent-foreground",
};
export function Badge({ status, children }: { status: string; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[status] ?? "bg-muted text-muted-foreground"}`}>
      {children}
    </span>
  );
}

export function ComingSoon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">Not available yet</span>
      <h2 className="mt-3 text-lg font-semibold text-foreground">{title}</h2>
      <div className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
