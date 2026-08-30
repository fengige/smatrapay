import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { assignMetersToAgent, listAssignableAgentMeters } from "@/lib/agents.functions";

export function AgentMeterAssignDialog({
  agentId,
  agentName,
  open,
  onClose,
}: {
  agentId: string;
  agentName: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchAssignable = useServerFn(listAssignableAgentMeters);
  const assign = useServerFn(assignMetersToAgent);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelected([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ["assignable-meters"],
    queryFn: () => fetchAssignable({ data: {} }),
    enabled: open,
  });

  const meters = useMemo(() => {
    const all = data?.meters ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (m) =>
        m.meter_number.toLowerCase().includes(q) ||
        (m.serial_number ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const mutation = useMutation({
    mutationFn: () => assign({ data: { agentId, meterIds: selected } }),
    onSuccess: (res) => {
      toast.success(
        `${res.assigned} meter${res.assigned === 1 ? "" : "s"} registered to ${agentName}`,
        res.skipped.length > 0
          ? { description: `Skipped (already assigned): ${res.skipped.join(", ")}` }
          : undefined,
      );
      queryClient.invalidateQueries({ queryKey: ["agent-meters", agentId] });
      queryClient.invalidateQueries({ queryKey: ["assignable-meters"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) return null;

  const allShownSelected = meters.length > 0 && meters.every((m) => selected.includes(m.id));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Register meters to agent"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-primary" />
            <h2 className="text-base font-bold text-foreground">Register meters</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="border-b border-border px-6 py-4">
          <p className="text-xs text-muted-foreground">
            Select unassigned meters to register to <span className="font-semibold">{agentName}</span>.
          </p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meter or serial number…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center p-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : meters.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              No unassigned meters available.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all listed meters"
                      checked={allShownSelected}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? Array.from(new Set([...selected, ...meters.map((m) => m.id)]))
                            : selected.filter((id) => !meters.some((m) => m.id === id)),
                        )
                      }
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">Meter no.</th>
                  <th className="px-4 py-3 font-semibold">Serial</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {meters.map((m) => (
                  <tr key={m.id} className="hover:bg-accent/5">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select meter ${m.meter_number}`}
                        checked={selected.includes(m.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{m.meter_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.serial_number}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{m.type}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <span className="text-xs text-muted-foreground">{selected.length} selected</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selected.length === 0 || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Register {selected.length > 0 ? selected.length : ""} meter
              {selected.length === 1 ? "" : "s"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
