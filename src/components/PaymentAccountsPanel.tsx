import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Pencil, Plus, Power, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  addPaymentAccount,
  deletePaymentAccount,
  listPaymentAccounts,
  listPaymentUsers,
  setDefaultPaymentAccount,
  setPaymentAccountStatus,
  updatePaymentAccount,
  type PaymentAccountRow,
  type PaymentUserType,
} from "@/lib/payment-accounts.functions";
import { listPaymentMethods, type PaymentMethodRow } from "@/lib/payment-methods.functions";

export type LockedPaymentUser = { id: string; name: string; type: PaymentUserType };


const USER_TYPES: { value: PaymentUserType; label: string }[] = [
  { value: "landlord", label: "Landlord" },
  { value: "agent", label: "Agent" },
  { value: "vendor", label: "Vendor" },
];

/** Which account fields make sense for a given payment method code/name. */
export function fieldsFor(method?: Pick<PaymentMethodRow, "code" | "name"> | null) {
  const key = `${method?.code ?? ""} ${method?.name ?? ""}`.toLowerCase();
  const isBank = /bank|swift|iban/.test(key);
  const isMobile = /mpesa|m-pesa|airtel|mobile|tigo|momo/.test(key);
  return {
    numberLabel: isBank ? "Account Number" : isMobile ? "Phone Number" : "Account Number / Phone",
    bank: isBank,
    branch: isBank,
    paybill: isMobile,
  };
}

export function PaymentAccountsPanel({
  methods: methodsProp,
  lockUser,
}: {
  methods?: PaymentMethodRow[];
  lockUser?: LockedPaymentUser;
}) {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listPaymentAccounts);
  const fetchMethods = useServerFn(listPaymentMethods);
  const statusFn = useServerFn(setPaymentAccountStatus);
  const defaultFn = useServerFn(setDefaultPaymentAccount);
  const removeFn = useServerFn(deletePaymentAccount);

  const methodsQuery = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => fetchMethods(),
    enabled: !methodsProp,
  });
  const methods = methodsProp ?? methodsQuery.data?.methods ?? [];


  const [q, setQ] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PaymentAccountRow | null>(null);
  const [viewing, setViewing] = useState<PaymentAccountRow | null>(null);
  const [deleting, setDeleting] = useState<PaymentAccountRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-accounts"],
    queryFn: () => fetchAccounts(),
  });
  const accounts = useMemo(() => data?.accounts ?? [], [data]);

  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.user_id, a.user_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [accounts]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts.filter((a) => {
      if (lockUser && a.user_id !== lockUser.id) return false;
      if (methodFilter && a.payment_method_id !== methodFilter) return false;
      if (typeFilter && a.user_type !== typeFilter) return false;
      if (userFilter && a.user_id !== userFilter) return false;
      if (statusFilter === "active" && !a.is_active) return false;
      if (statusFilter === "inactive" && a.is_active) return false;
      if (!needle) return true;
      return [a.account_name ?? "", a.account_number, a.user_name, a.payment_method_name]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [accounts, q, methodFilter, typeFilter, userFilter, statusFilter, lockUser]);


  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["payment-accounts"] });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => statusFn({ data: v } as never),
    onSuccess: async (_r, v) => {
      await invalidate();
      toast.success(v.is_active ? "Payment account activated" : "Payment account deactivated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => defaultFn({ data: { id } } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Default payment account updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } } as never),
    onSuccess: async () => {
      setDeleting(null);
      await invalidate();
      toast.success("Payment account deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">
            {lockUser ? "Payment Methods & Accounts" : "Payment Accounts"}
          </h2>
          {lockUser && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Payment methods and account details saved for {lockUser.name}.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-4" /> Add Payment Account
        </button>
      </div>

      <div
        className={`mt-4 grid gap-3 md:grid-cols-2 ${lockUser ? "xl:grid-cols-3" : "xl:grid-cols-5"}`}
      >
        <div className="relative xl:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search payment accounts"
            placeholder="Search account, number or user"
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          aria-label="Filter by payment method"
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">All payment methods</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {!lockUser && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by user type"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">All user types</option>
            {USER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {!lockUser && (
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            aria-label="Filter by user"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">All users</option>
            {userOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>


      {isLoading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {lockUser
            ? `No payment methods saved for ${lockUser.name} yet. Use “Add Payment Account” to add one.`
            : "No payment accounts yet. Use “Add Payment Account” to create one."}
        </p>

      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2">Payment Method</th>
                <th className="px-3 py-2">User Type</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Account Name</th>
                <th className="px-3 py-2">Account Number</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border/60">
                  <td className="px-3 py-3 font-medium text-foreground">
                    {a.payment_method_name}
                    {a.is_default && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 capitalize">{a.user_type}</td>
                  <td className="px-3 py-3">{a.user_name}</td>
                  <td className="px-3 py-3">{a.account_name || "—"}</td>
                  <td className="px-3 py-3 font-mono">{a.account_number_masked}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.is_active
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {a.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1.5">
                      <IconButton label={`View ${a.account_number_masked}`} onClick={() => setViewing(a)}>
                        <Eye className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`Edit account for ${a.user_name}`}
                        onClick={() => {
                          setEditing(a);
                          setShowForm(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`Set default account for ${a.user_name}`}
                        onClick={() => defaultMutation.mutate(a.id)}
                        className={a.is_default ? "text-primary" : ""}
                      >
                        <Star className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`${a.is_active ? "Deactivate" : "Activate"} account for ${a.user_name}`}
                        onClick={() =>
                          statusMutation.mutate({ id: a.id, is_active: !a.is_active })
                        }
                      >
                        <Power className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`Delete account for ${a.user_name}`}
                        onClick={() => setDeleting(a)}
                        className="text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <AccountDialog
          methods={methods}
          account={editing}
          {...(lockUser ? { lockUser } : {})}
          onClose={() => {


            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {viewing && (
        <Dialog title="Payment account details" onClose={() => setViewing(null)}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Payment method" value={viewing.payment_method_name} />
            <Detail label="User type" value={viewing.user_type} />
            <Detail label="User" value={viewing.user_name} />
            <Detail label="Account name" value={viewing.account_name || "—"} />
            <Detail label="Account number" value={viewing.account_number} />
            <Detail label="Bank" value={viewing.bank_name || "—"} />
            <Detail label="Branch" value={viewing.branch || "—"} />
            <Detail label="Paybill / Till" value={viewing.paybill_number || "—"} />
            <Detail label="Status" value={viewing.is_active ? "Active" : "Inactive"} />
            <Detail label="Default" value={viewing.is_default ? "Yes" : "No"} />
            <Detail label="Additional details" value={viewing.details || "—"} />
          </dl>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setViewing(null)}
              className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </Dialog>
      )}

      {deleting && (
        <Dialog title="Delete payment account" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Delete the {deleting.payment_method_name} account{" "}
            <span className="font-medium text-foreground">{deleting.account_number_masked}</span>{" "}
            for {deleting.user_name}? This cannot be undone.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate(deleting.id)}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
            >
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />} Delete
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize text-foreground">{value}</dd>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent/10 ${className}`}
    >
      {children}
    </button>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Close dialog" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <h2 className="mb-4 text-base font-bold text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function AccountDialog({
  methods,
  account,
  lockUser,
  onClose,
}: {
  methods: PaymentMethodRow[];
  account: PaymentAccountRow | null;
  lockUser?: LockedPaymentUser;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(addPaymentAccount);
  const update = useServerFn(updatePaymentAccount);
  const fetchUsers = useServerFn(listPaymentUsers);

  const [methodId, setMethodId] = useState(account?.payment_method_id ?? "");
  const [userType, setUserType] = useState<PaymentUserType | "">(
    account?.user_type ?? lockUser?.type ?? "",
  );
  const [userId, setUserId] = useState(account?.user_id ?? lockUser?.id ?? "");

  const [accountName, setAccountName] = useState(account?.account_name ?? "");
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? "");
  const [bankName, setBankName] = useState(account?.bank_name ?? "");
  const [branch, setBranch] = useState(account?.branch ?? "");
  const [paybill, setPaybill] = useState(account?.paybill_number ?? "");
  const [details, setDetails] = useState(account?.details ?? "");
  const [isActive, setIsActive] = useState(account?.is_active ?? true);
  const [isDefault, setIsDefault] = useState(account?.is_default ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const activeMethods = useMemo(
    () => methods.filter((m) => m.is_active || m.id === account?.payment_method_id),
    [methods, account],
  );
  const method = activeMethods.find((m) => m.id === methodId) ?? null;
  const shape = fieldsFor(method);

  const usersQuery = useQuery({
    queryKey: ["payment-users", userType],
    queryFn: () => fetchUsers({ data: { user_type: userType as PaymentUserType } } as never),
    enabled: !!userType,
  });

  useEffect(() => {
    if (!userType) return;
    const list = usersQuery.data?.users ?? [];
    if (userId && list.length && !list.some((u) => u.id === userId)) setUserId("");
  }, [usersQuery.data, userType, userId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        payment_method_id: methodId,
        user_type: userType as PaymentUserType,
        user_id: userId,
        account_name: accountName.trim() || null,
        account_number: accountNumber.trim(),
        bank_name: shape.bank ? bankName.trim() || null : null,
        branch: shape.branch ? branch.trim() || null : null,
        paybill_number: shape.paybill ? paybill.trim() || null : null,
        details: details.trim() || null,
        is_active: isActive,
        is_default: isDefault,
      };
      return account
        ? update({ data: { ...payload, id: account.id } } as never)
        : create({ data: payload } as never);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payment-accounts"] });
      toast.success(account ? "Payment account updated" : "Payment account added");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not save payment account"),
  });

  function submit() {
    const next: Record<string, string> = {};
    if (!methodId) next["method"] = "Payment method is required";
    if (!userType) next["userType"] = "User type is required";
    if (!userId) next["user"] = "User is required";
    const number = accountNumber.trim();
    if (number.length < 4) next["number"] = `${shape.numberLabel} is required`;
    else if (!/^[0-9+\-\s]+$/.test(number))
      next["number"] = "Only digits, spaces, + and - are allowed";
    else if (shape.paybill && !/^\+?\d[\d\s-]{6,}$/.test(number))
      next["number"] = "Enter a valid phone number";
    if (shape.bank && !bankName.trim()) next["bank"] = "Bank name is required";
    setErrors(next);
    if (Object.keys(next).length) return;
    mutation.mutate();
  }

  return (
    <Dialog title={account ? "Edit Payment Account" : "Add Payment Account"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Payment Method" id="pa-method" error={errors["method"]}>
          <select
            id="pa-method"
            value={methodId}
            onChange={(e) => setMethodId(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">Select payment method</option>
            {activeMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="User Type" id="pa-type" error={errors["userType"]}>
            <select
              id="pa-type"
              value={userType}
              onChange={(e) => {
                setUserType(e.target.value as PaymentUserType);
                setUserId("");
              }}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">Select user type</option>
              {USER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="User" id="pa-user" error={errors["user"]}>
            <select
              id="pa-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={!userType || usersQuery.isLoading}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
            >
              <option value="">
                {!userType
                  ? "Select user type first"
                  : usersQuery.isLoading
                    ? "Loading users…"
                    : "Select user"}
              </option>
              {(usersQuery.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account Name" id="pa-name">
            <input
              id="pa-name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </Field>
          <Field label={shape.numberLabel} id="pa-number" error={errors["number"]}>
            <input
              id="pa-number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              inputMode="tel"
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </Field>
        </div>

        {shape.bank && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bank Name" id="pa-bank" error={errors["bank"]}>
              <input
                id="pa-bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </Field>
            <Field label="Branch" id="pa-branch">
              <input
                id="pa-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </Field>
          </div>
        )}

        {shape.paybill && (
          <Field label="Paybill / Till Number" id="pa-paybill">
            <input
              id="pa-paybill"
              value={paybill}
              onChange={(e) => setPaybill(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </Field>
        )}

        <Field label="Additional Account Details" id="pa-details">
          <textarea
            id="pa-details"
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm"
          />
        </Field>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Default account for this payment method
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          {account ? "Save changes" : "Save"}
        </button>
      </div>
    </Dialog>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
