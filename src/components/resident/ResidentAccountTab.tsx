import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { residentAccountPasswordInput } from "@/lib/resident-account";
import { getResidentAccount, updateResidentAccountPassword } from "@/lib/resident-account.functions";

export function ResidentAccountTab({ id, portal }: { id: string; portal: "admin" | "vendor" }) {
  const getAccount = useServerFn(getResidentAccount);
  const updatePassword = useServerFn(updateResidentAccountPassword);
  const queryClient = useQueryClient();
  const queryKey = ["resident-account", portal, id];
  const account = useQuery({ queryKey, queryFn: () => getAccount({ data: { id, portal } }), retry: false });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState({ password: false, confirmation: false });
  const [error, setError] = useState("");
  const clear = () => { setPassword(""); setConfirmation(""); setError(""); setVisible({ password: false, confirmation: false }); };
  const mutation = useMutation({
    mutationFn: () => updatePassword({ data: { id, portal, password, confirmation } }),
    onSuccess: async (result) => {
      clear();
      toast.success("Resident password updated");
      if (!result.residentNotified) toast.warning("Password updated, but the resident notification could not be saved.");
      if (!result.auditRecorded) toast.warning("Password updated; the audit attempt was saved, but its completion record could not be saved.");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (failure: Error) => setError(failure.message),
  });
  if (account.isPending) return <p className="p-5 text-sm text-muted-foreground">Loading account…</p>;
  if (account.error || !account.data) return <p className="p-5 text-sm text-destructive" role="alert">{account.error?.message ?? "Account unavailable."}</p>;
  const data = account.data;
  const strength = [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  return <section className="space-y-6 border-t border-border px-5 py-6">
    <dl className="grid gap-4 sm:grid-cols-2">
      {[["Full name", data.name ?? "—"], ["Username", data.username ?? "—"], ["Account status", data.status], ["Last password change", data.lastPasswordChange ? new Date(data.lastPasswordChange).toLocaleString() : "Not recorded"]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm capitalize text-foreground">{value}</dd></div>)}
    </dl>
    <form className="max-w-xl space-y-4 border-t border-border pt-5" onSubmit={(event) => {
      event.preventDefault();
      const parsed = residentAccountPasswordInput.safeParse({ id, portal, password, confirmation });
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the password fields."); return; }
      setError(""); mutation.mutate();
    }}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><KeyRound className="size-4" />Change Password</h2>
      {(["password", "confirmation"] as const).map((field) => <div className="space-y-2" key={field}>
        <Label htmlFor={`resident-${field}`}>{field === "password" ? "New Password" : "Confirm New Password"}</Label>
        <div className="relative">
          <Input id={`resident-${field}`} required type={visible[field] ? "text" : "password"} autoComplete="new-password" maxLength={72} className="pr-12" value={field === "password" ? password : confirmation} disabled={mutation.isPending} onChange={(event) => field === "password" ? setPassword(event.target.value) : setConfirmation(event.target.value)} aria-describedby="resident-password-policy" />
          <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" title={`${visible[field] ? "Hide" : "Show"} ${field === "password" ? "new password" : "confirmation"}`} aria-label={`${visible[field] ? "Hide" : "Show"} ${field === "password" ? "new password" : "confirmation"}`} onClick={() => setVisible((value) => ({ ...value, [field]: !value[field] }))}>{visible[field] ? <EyeOff /> : <Eye />}</Button>
        </div>
      </div>)}
      <p id="resident-password-policy" className="text-xs text-muted-foreground">At least 6 characters.</p>
      <div className="space-y-1" aria-live="polite"><div className="flex gap-1" role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={5} aria-valuenow={strength}>{Array.from({ length: 5 }, (_, index) => <span key={index} className={`h-1.5 flex-1 rounded-sm ${index < strength ? "bg-primary" : "bg-muted"}`} />)}</div><p className="text-xs text-muted-foreground">{password ? strength === 5 ? "Strong" : strength >= 3 ? "Fair — complete all requirements" : "Weak" : "Password strength"}</p></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}Update Password</Button><Button type="button" variant="outline" disabled={mutation.isPending} onClick={clear}>Cancel</Button></div>
    </form>
  </section>;
}