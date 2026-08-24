import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { LogOut, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listUsers, updateUser, deleteUser } from "@/lib/users.functions";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "User directory · SmatraPay" },
      {
        name: "description",
        content:
          "Admin directory of SmatraPay accounts: names, usernames, emails, phones, roles, statuses and notes.",
      },
      { property: "og:title", content: "User directory · SmatraPay" },
      {
        property: "og:description",
        content: "Manage SmatraPay accounts, roles, statuses and profile details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UsersPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  email_verified_at: string | null;
  username: string | null;
  phone: string | null;
  profile_image: string | null;
  bio: string | null;
  notes: string | null;
  status: string;
  role: string;
  created_at: string;
  updated_at: string;
};

const statuses = ["active", "inactive", "suspended", "pending"];
const roles = [
  "admin",
  "landlord",
  "vendor",
  "agent",
  "service_provider",
  "resident",
  "moderator",
  "user",
];

function UsersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const saveUser = useServerFn(updateUser);
  const removeUser = useServerFn(deleteUser);
  const [editing, setEditing] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchUsers(),
  });

  const saveMutation = useMutation({
    mutationFn: (row: Row) =>
      saveUser({
        data: {
          id: row.id,
          name: row.name,
          username: row.username,
          email: row.email,
          phone: row.phone,
          profile_image: row.profile_image,
          bio: row.bio,
          notes: row.notes,
          status: row.status as "active",
          ...(data?.isAdmin ? { role: row.role as "user" } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeUser({ data: { id } }),
    onSuccess: () => {
      toast.success("User removed");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const users = (data?.users ?? []) as Row[];

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="SmatraPay" className="h-7 w-auto" />
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="size-4 text-primary" /> User directory
          </span>
        </div>
        <button onClick={signOut} className="btn-outline">
          <LogOut className="size-4" /> Sign out
        </button>
      </header>

      <div className="px-6 py-8">
        {!data?.isAdmin && !isLoading && (
          <p className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            You're signed in as a standard user, so you only see your own record. An admin can
            promote your account to see everyone.
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading users…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Verified</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.profile_image ? (
                          <img
                            src={u.profile_image}
                            alt={u.name ?? "User avatar"}
                            className="size-8 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <div className="font-medium text-foreground">{u.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.username ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.phone ?? "—"}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{u.role}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{u.status}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.email_verified_at ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          aria-label="Edit user"
                          className="rounded-md border border-border p-2 hover:bg-accent/10"
                          onClick={() => setEditing(u)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        {data?.isAdmin && (
                          <button
                            aria-label="Delete user"
                            className="rounded-md border border-border p-2 text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm("Remove this user record?")) deleteMutation.mutate(u.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-6">
            <h2 className="text-lg font-bold text-foreground">Edit user</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate(editing);
              }}
            >
              {(
                [
                  ["Name", "name"],
                  ["Username", "username"],
                  ["Email", "email"],
                  ["Phone", "phone"],
                  ["Profile image URL", "profile_image"],
                ] as const
              ).map(([label, key]) => (
                <div key={key}>
                  <label className="field-label" htmlFor={key}>
                    {label}
                  </label>
                  <div className="input-shell">
                    <input
                      id={key}
                      className="input-field"
                      value={editing[key] ?? ""}
                      onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                    />
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="status">
                    Status
                  </label>
                  <select
                    id="status"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={editing.status}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="role">
                    Role
                  </label>
                  <select
                    id="role"
                    disabled={!data?.isAdmin}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                    value={editing.role}
                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="bio">
                  Bio
                </label>
                <textarea
                  id="bio"
                  rows={2}
                  maxLength={1000}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={editing.bio ?? ""}
                  onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="notes">
                  Notes
                </label>
                <textarea
                  id="notes"
                  rows={2}
                  maxLength={2000}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-outline" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
