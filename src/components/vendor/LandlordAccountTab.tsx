import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { landlordAccountPasswordInput } from "@/lib/landlord-account";
import { getVendorLandlordAccount, updateVendorLandlordPassword } from "@/lib/landlord-account.functions";

export function LandlordAccountTab({ id }: { id: string }) {
  const getAccount = useServerFn(getVendorLandlordAccount);
  const updatePassword = useServerFn(updateVendorLandlordPassword);
  const queryClient = useQueryClient();
  const queryKey = ["vendor-landlord-account", id];
  const account = useQuery({ queryKey, queryFn: () => getAccount({ data: { id } }), retry: false });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState({ password: false, confirmation: false });
  const [error, setError] = useState("");
  const clear = () => { setPassword(""); setConfirmation(""); setError(""); setVisible({ password: false, confirmation: false }); };
  const mutation = useMutation({
    mutationFn: () => updatePassword({ data: { id, password, confirmation } }),
    onSuccess: async result => {
      clear();
      toast.success("Landlord password updated");
      if (!result.landlordNotified) toast.warning("Password updated, but the landlord notification could not be saved.");
      if (!result.auditRecorded) toast.warning("Password updated; the audit attempt was saved, but its completion record could not be saved.");
      await Promise.all([queryClient.invalidateQueries({ queryKey }), queryClient.invalidateQueries({ queryKey: ["vendor-landlord", id] })]);
    },
    onError: (failure: Error) => setError(failure.message),
  });
  if (account.isPending) return <p className="p-5 text-sm text-muted-foreground">Loading account…</p>;
  if (account.error || !account.data) return <div className="space-y-3 p-5"><p role="alert" className="text-sm text-destructive">{account.error?.message ?? "Account unavailable."}</p><Button variant="outline" onClick={() => account.refetch()}>Retry</Button></div>;
  const data = account.data;
  return <section className="space-y-6 border-t border-border py-6">
    <dl className="grid gap-4 sm:grid-cols-2">
      {[["Landlord", data.name ?? "—"], ["Email", data.email ?? "—"], ["Account status", data.status], ["Last password change", data.lastPasswordChange ? new Date(data.lastPasswordChange).toLocaleString() : "Not recorded"]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm text-foreground">{value}</dd></div>)}
    </dl>
    <form className="max-w-xl space-y-4 border-t border-border pt-5" onSubmit={event => {
      event.preventDefault();
      const parsed = landlordAccountPasswordInput.safeParse({ id, password, confirmation });
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the password fields."); return; }
      setError(""); mutation.mutate();
    }}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><KeyRound className="size-4" />Change Password</h2>
      {(["password", "confirmation"] as const).map(field => <div className="space-y-2" key={field}>
        <Label htmlFor={`landlord-${field}`}>{field === "password" ? "New Password" : "Confirm New Password"}</Label>
        <div className="relative">
          <Input id={`landlord-${field}`} required type={visible[field] ? "text" : "password"} autoComplete="new-password" maxLength={72} className="pr-12" value={field === "password" ? password : confirmation} disabled={mutation.isPending} onChange={event => field === "password" ? setPassword(event.target.value) : setConfirmation(event.target.value)} />
          <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" disabled={mutation.isPending} title={`${visible[field] ? "Hide" : "Show"} ${field === "password" ? "new password" : "confirmation"}`} aria-label={`${visible[field] ? "Hide" : "Show"} ${field === "password" ? "new password" : "confirmation"}`} onClick={() => setVisible(value => ({ ...value, [field]: !value[field] }))}>{visible[field] ? <EyeOff /> : <Eye />}</Button>
        </div>
      </div>)}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}Update Password</Button><Button type="button" variant="outline" disabled={mutation.isPending} onClick={clear}>Cancel</Button></div>
    </form>
  </section>;
}