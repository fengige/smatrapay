import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { residentSelfPassword } from "@/lib/resident-profile";
import { changeResidentPassword } from "@/lib/resident-profile.functions";
import { residentMfa } from "@/lib/resident-mfa.functions";
import { resetResidentPassword } from "@/lib/resident-password.functions";
import { supabase } from "@/integrations/supabase/client";

export function ResidentSecurity({ identifier, onChange }: { identifier: string; onChange: () => void }) {
  const change = useServerFn(changeResidentPassword); const security = useServerFn(residentMfa); const recovery = useServerFn(resetResidentPassword);
  const status = useQuery({ queryKey: ["resident-mfa"], queryFn: () => security({ data: { action: "status" } }) });
  const [form, setForm] = useState({ current: "", password: "", confirmation: "" }); const [show, setShow] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [disable, setDisable] = useState(false); const [code, setCode] = useState(""); const [mfaError, setMfaError] = useState(""); const [mfaBusy, setMfaBusy] = useState(false);
  const factors = status.data?.kind === "status" ? status.data.factors : [];
  const verified = factors.find(f => f.status === "verified");
  const strength = [form.password.length >= 6, /[a-z]/.test(form.password), /[A-Z]/.test(form.password), /\d/.test(form.password), /[^A-Za-z0-9]/.test(form.password)].filter(Boolean).length;
  const clear = () => { setForm({ current: "", password: "", confirmation: "" }); setShow({}); setError(""); };
  const run = async (fn: () => Promise<void>) => { setMfaBusy(true); setMfaError(""); try { await fn(); await status.refetch(); onChange(); } catch (e) { setMfaError((e as Error).message); } finally { setMfaBusy(false); } };
  return <div className="space-y-8 py-6">
    <section className="max-w-xl"><h2 className="mb-5 flex items-center gap-2 text-lg font-semibold"><KeyRound className="size-5 text-primary" />Password Change</h2><form className="space-y-4" onSubmit={async e => { e.preventDefault(); const parsed = residentSelfPassword.safeParse(form); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your password."); return; } setBusy(true); setError(""); try { await change({ data: parsed.data }); clear(); toast.success("Password changed"); onChange(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
      {(["current", "password", "confirmation"] as const).map(key => <div className="space-y-2" key={key}><Label htmlFor={`self-${key}`}>{key === "current" ? "Current Password" : key === "password" ? "New Password" : "Confirm New Password"}</Label><div className="relative"><Input id={`self-${key}`} type={show[key] ? "text" : "password"} autoComplete={key === "current" ? "current-password" : "new-password"} required maxLength={key === "current" ? 256 : 72} className="pr-12" disabled={busy} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" aria-label={`${show[key] ? "Hide" : "Show"} ${key} password`} onClick={() => setShow({ ...show, [key]: !show[key] })}>{show[key] ? <EyeOff /> : <Eye />}</Button></div></div>)}
      <p className="text-xs text-muted-foreground">6–72 characters. No required character combinations.</p><div role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={5} aria-valuenow={strength} className="flex gap-1">{Array.from({ length: 5 }, (_, i) => <span key={i} className={`h-1 flex-1 rounded-sm ${i < strength ? "bg-primary" : "bg-muted"}`} />)}</div><p className="text-xs text-muted-foreground">{form.password ? strength >= 4 ? "Strong" : strength >= 3 ? "Fair" : "Weak" : "Password strength"}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap gap-2"><Button disabled={busy}>{busy ? "Changing…" : "Change Password"}</Button><Button variant="outline" type="button" disabled={busy} onClick={clear}>Cancel</Button><Button variant="link" type="button" disabled={busy} onClick={async () => { try { const result = await recovery({ data: { username: identifier } }); toast.success(result.message); } catch { toast.error("Could not request password recovery."); } }}>Forgot Password?</Button></div>
    </form></section>
    <section className="border-t border-border pt-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-primary" />Two-Factor Authentication</h2><p className="mt-2 text-sm text-muted-foreground">An authenticator code adds protection after your password or Google sign-in.</p><p className="mt-4 text-sm font-semibold">Status: {status.isPending ? "Loading…" : status.error ? "Unavailable" : verified ? "Enabled · Authenticator app" : "Disabled"}</p>{!verified && factors.some(f => f.status !== "verified") && <p className="mt-1 text-xs text-muted-foreground">Enrollment incomplete</p>}
      <Button className="mt-4" variant={verified ? "outline" : "default"} disabled={mfaBusy || status.isPending || !!status.error} onClick={() => verified ? setDisable(true) : void run(async () => { const r = await security({ data: { action: "enroll" } }); if (r.kind === "enrollment") setEnrollment(r); })}>{verified ? "Disable 2FA" : "Enable 2FA"}</Button>
      <p className="mt-3 text-xs text-muted-foreground">Authenticator-app codes are supported. Recovery codes and SMS second factors are not offered here; lost-authenticator recovery requires identity verification by your account administrator.</p>{(mfaError || status.error) && <p role="alert" className="mt-3 text-sm text-destructive">{mfaError || "Could not load two-factor status. Try refreshing."}</p>}
    </section>
    <Dialog open={!!enrollment || disable} onOpenChange={() => { if (!mfaBusy) void run(async () => { if (enrollment) await security({ data: { action: "cancel", factorId: enrollment.id } }); setEnrollment(null); setDisable(false); setCode(""); }); }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{disable ? "Disable two-factor authentication?" : "Set up your authenticator"}</DialogTitle></DialogHeader>
      {enrollment && <><img src={enrollment.qr} alt="Authenticator enrollment QR code" className="mx-auto size-48" /><details className="text-sm"><summary>Enter setup key manually</summary><p className="mt-2 break-all font-mono">{enrollment.secret}</p></details></>}{disable && <p className="text-sm text-muted-foreground">Disabling 2FA reduces account protection. Confirm with your current authenticator code.</p>}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); const id = enrollment?.id ?? verified?.id; if (!id) return; void run(async () => { const r = await security({ data: { action: "verify", factorId: id, code, purpose: disable ? "disable" : "enable" } }); if (r.kind !== "verified") throw new Error("Verification failed."); const session = await supabase.auth.setSession(r); if (session.error) throw session.error; if (disable) await supabase.auth.refreshSession(); toast.success(disable ? "Two-factor authentication disabled" : "Two-factor authentication enabled"); setEnrollment(null); setDisable(false); setCode(""); }); }}><Label htmlFor="profile-mfa-code">Authenticator code</Label><Input id="profile-mfa-code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} />{mfaError && <p role="alert" className="text-sm text-destructive">{mfaError}</p>}<Button disabled={mfaBusy}>{mfaBusy ? "Verifying…" : disable ? "Verify and Disable 2FA" : "Verify and Enable 2FA"}</Button></form>
    </DialogContent></Dialog>
  </div>;
}