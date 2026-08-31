import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquare, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteSmsConfiguration,
  listSmsConfigurations,
  saveSmsConfiguration,
  setSmsConfigurationStatus,
  type SmsConfigRow,
} from "@/lib/configurations.functions";

export const Route = createFileRoute("/_authenticated/configurations/sms")({
  head: () => ({
    meta: [
      { title: "SMS Configuration · SmatraPay" },
      {
        name: "description",
        content: "Manage SMS providers, API credentials and sender IDs used to deliver tokens.",
      },
      { property: "og:title", content: "SMS Configuration · SmatraPay" },
      {
        property: "og:description",
        content: "Add, edit, enable or remove SMS gateway providers for SmatraPay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SmsTab,
});

type FormState = {
  id?: string;
  provider_name: string;
  provider_code: string;
  api_url: string;
  api_key: string;
  api_secret: string;
  username: string;
  password: string;
  sender_id: string;
  account_id: string;
  client_id: string;
  is_active: boolean;
  is_default: boolean;
};

const EMPTY: FormState = {
  provider_name: "",
  provider_code: "",
  api_url: "",
  api_key: "",
  api_secret: "",
  username: "",
  password: "",
  sender_id: "",
  account_id: "",
  client_id: "",
  is_active: true,
  is_default: false,
};

function toForm(row: SmsConfigRow): FormState {
  return {
    id: row.id,
    provider_name: row.provider_name ?? "",
    provider_code: row.provider_code ?? "",
    api_url: row.api_url ?? "",
    api_key: row.api_key ?? "",
    api_secret: row.api_secret ?? "",
    username: row.username ?? "",
    password: row.password ?? "",
    sender_id: row.sender_id ?? "",
    account_id: row.account_id ?? "",
    client_id: row.client_id ?? "",
    is_active: Boolean(row.is_active),
    is_default: Boolean(row.is_default),
  };
}

function SmsTab() {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listSmsConfigurations);
  const save = useServerFn(saveSmsConfiguration);
  const toggle = useServerFn(setSmsConfigurationStatus);
  const remove = useServerFn(deleteSmsConfiguration);

  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<SmsConfigRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sms-configurations"],
    queryFn: () => fetchList(),
  });
  const rows = data?.configurations ?? [];

  useEffect(() => setError(null), [form]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["sms-configurations"] });
  }

  const saveMutation = useMutation({
    mutationFn: (payload: FormState) => save({ data: payload } as never),
    onSuccess: async () => {
      setForm(null);
      await refresh();
      toast.success("SMS provider saved");
    },
    onError: (e: Error) => setError(e.message || "Could not save provider"),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; is_active: boolean }) => toggle({ data: vars } as never),
    onSuccess: async (_r, vars) => {
      await refresh();
      toast.success(vars.is_active ? "Provider enabled" : "Provider disabled");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update provider"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } } as never),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
      toast.success("Provider deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete provider"),
  });

  function field(key: keyof FormState, label: string, type: "text" | "password" = "text") {
    if (!form) return null;
    const id = `sms-${key}`;
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <input
          id={id}
          type={type}
          autoComplete="off"
          value={String(form[key] ?? "")}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          maxLength={500}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4 text-primary" />
          {rows.length} provider{rows.length === 1 ? "" : "s"} configured
        </div>
        <button
          type="button"
          onClick={() => setForm({ ...EMPTY })}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-4" /> Add Provider
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Provider</th>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Sender ID</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Default</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No SMS providers yet. Add one to start delivering token receipts.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium text-foreground">{row.provider_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.provider_code}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.sender_id ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      row.is_active
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.is_default ? "Yes" : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(toForm(row))}
                      aria-label={`Edit ${row.provider_name}`}
                      className="rounded-lg border border-border p-2 hover:bg-accent/10"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        toggleMutation.mutate({ id: row.id, is_active: !row.is_active })
                      }
                      aria-label={`${row.is_active ? "Disable" : "Enable"} ${row.provider_name}`}
                      className="rounded-lg border border-border p-2 hover:bg-accent/10"
                    >
                      <Power className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(row)}
                      aria-label={`Delete ${row.provider_name}`}
                      className="rounded-lg border border-border p-2 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={form.id ? "Edit SMS provider" : "Add SMS provider"}
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5"
          >
            <h2 className="text-base font-semibold">
              {form.id ? "Edit SMS provider" : "Add SMS provider"}
            </h2>
            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (form.provider_name.trim().length < 2 || form.provider_code.trim().length < 2) {
                  setError("Provider name and code are required");
                  return;
                }
                saveMutation.mutate(form);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {field("provider_name", "Provider name")}
                {field("provider_code", "Provider code")}
                {field("api_url", "API URL")}
                {field("api_key", "API key", "password")}
                {field("api_secret", "API secret", "password")}
                {field("sender_id", "Sender ID")}
                {field("username", "Username")}
                {field("password", "Password", "password")}
                {field("account_id", "Account ID")}
                {field("client_id", "Client ID")}
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  />
                  Default provider
                </label>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Save provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm provider deletion"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5"
          >
            <h2 className="text-base font-semibold">Delete {deleting.provider_name}?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This removes the provider configuration. Sent message history is kept.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleting.id)}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
