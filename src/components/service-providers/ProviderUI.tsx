import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteServiceProvider, setServiceProviderStatus } from "@/lib/service-providers.functions";

export const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary";

const tone: Record<string, string> = {
  active: "bg-accent/12 text-accent",
  suspended: "bg-destructive/12 text-destructive",
  pending: "bg-primary/12 text-primary",
  inactive: "bg-muted text-muted-foreground",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tone[status] ?? tone["inactive"]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function initialsOf(name: string | null | undefined, fallback = "?") {
  return (
    (name || fallback)
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function ProviderAvatar({
  src,
  name,
  className = "size-9",
  rounded = "rounded-full",
}: {
  src: string | null | undefined;
  name: string | null | undefined;
  className?: string;
  rounded?: string;
}) {
  return src ? (
    <img
      src={src}
      alt={name ? `${name}` : "Service provider"}
      className={`${className} ${rounded} object-cover`}
    />
  ) : (
    <span
      className={`${className} ${rounded} flex items-center justify-center bg-primary/10 text-xs font-bold text-primary`}
    >
      {initialsOf(name)}
    </span>
  );
}

export function Field({
  label,
  required,
  error,
  children,
  hint,
}: {
  label: string;
  required?: boolean | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="block text-xs text-destructive">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

type Action = "suspend" | "unsuspend" | "delete";
type Target = { id: string; name: string | null; email?: string | null };

/** Confirmation-guarded suspend / unsuspend / soft-delete for a service provider. */
export function useProviderActions(onDone?: (action: Action) => void) {
  const qc = useQueryClient();
  const setStatus = useServerFn(setServiceProviderStatus);
  const remove = useServerFn(deleteServiceProvider);
  const [pending, setPending] = useState<{ action: Action; target: Target } | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ action, target }: { action: Action; target: Target }) => {
      if (action === "delete") return remove({ data: { id: target.id } });
      return setStatus({
        data: { id: target.id, status: action === "suspend" ? "suspended" : "active" },
      });
    },
    onSuccess: async (_r, { action, target }) => {
      const who = target.name || "Service provider";
      toast.success(
        action === "delete"
          ? `${who} deleted`
          : action === "suspend"
            ? `${who} suspended`
            : `${who} is active again`,
      );
      setPending(null);
      await qc.invalidateQueries({ queryKey: ["service-providers"] });
      await qc.invalidateQueries({ queryKey: ["service-provider", target.id] });
      onDone?.(action);
    },
    onError: (e: Error) => toast.error(e.message || "Action failed"),
  });

  const run = (action: Action, target: Target) => {
    if (action === "unsuspend") mutation.mutate({ action, target });
    else setPending({ action, target });
  };

  const dialog = (
    <AlertDialog
      open={!!pending}
      onOpenChange={(o) => !o && !mutation.isPending && setPending(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending?.action === "delete"
              ? "Delete service provider?"
              : "Suspend service provider?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">
                  {pending?.target.name || "This provider"}
                </span>
                {pending?.target.email ? ` (${pending.target.email})` : ""}
              </p>
              {pending?.action === "delete" ? (
                <p>
                  They will be removed from the list and can no longer sign in. Their services, jobs
                  and history are kept.
                </p>
              ) : (
                <p>
                  They will not be able to sign in or receive new jobs. All information, services
                  and job history are kept, and you can unsuspend them at any time.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              if (pending) mutation.mutate(pending);
            }}
          >
            {mutation.isPending ? "Working…" : pending?.action === "delete" ? "Delete" : "Suspend"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { run, dialog, busy: mutation.isPending };
}
