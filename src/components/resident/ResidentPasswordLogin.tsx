import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, Lock, LogIn, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { residentCredentials, residentLoginIdentifier } from "@/lib/resident-password";
import { resetResidentPassword, signInResidentPassword } from "@/lib/resident-password.functions";

export function ResidentPasswordLogin({ disabled, onSignedIn }: { disabled: boolean; onSignedIn: () => Promise<unknown> }) {
  const login = useServerFn(signInResidentPassword);
  const reset = useServerFn(resetResidentPassword);
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || disabled) return;
    const parsed = residentCredentials.safeParse({ username, password });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Enter your username and password."); return; }
    setBusy(true); setError("");
    try {
      const session = await login({ data: parsed.data });
      await qc.cancelQueries(); qc.clear();
      localStorage.setItem("sp_remember", remember ? "1" : "0"); sessionStorage.setItem("sp_active", "1");
      const { error } = await supabase.auth.setSession(session);
      if (error) throw new Error("Could not establish your session. Please try again.");
      setPassword(""); await onSignedIn();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <form className="space-y-4" onSubmit={submit}>
      <div><label htmlFor="resident-username" className="field-label">Username or email <span className="text-destructive">*</span></label><div className="input-shell"><span className="input-addon"><UserRound className="size-4" /></span><input id="resident-username" className="input-field" autoComplete="username" required maxLength={254} value={username} onChange={(e) => setUsername(e.target.value)} /></div></div>
      <div><div className="mb-1 flex items-center justify-between"><label htmlFor="resident-password" className="field-label mb-0">Password <span className="text-destructive">*</span></label><Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => { setForgot(true); setResetUsername(username); setResetMessage(""); }}>Forgot Password?</Button></div>
        <div className="input-shell"><span className="input-addon"><Lock className="size-4" /></span><input id="resident-password" className="input-field" type={show ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} /><Button type="button" variant="ghost" size="icon" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</Button></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-primary" />Remember me</label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={disabled || busy}>{busy ? <Loader2 className="animate-spin" /> : <LogIn />}{busy ? "Signing in…" : "Sign In"}</Button>
    </form>
    <Dialog open={forgot} onOpenChange={setForgot}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Reset your password</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (resetBusy) return; const parsed = residentLoginIdentifier.safeParse(resetUsername); if (!parsed.success) { setResetMessage("Enter a valid username or email address."); return; } setResetBusy(true); try { const r = await reset({ data: { username: parsed.data } }); setResetMessage(r.message); } catch (e) { setResetMessage((e as Error).message); } finally { setResetBusy(false); } }}>
        <label className="field-label" htmlFor="recovery-username">Username or email</label><div className="input-shell"><input id="recovery-username" className="input-field" autoComplete="username" required maxLength={254} value={resetUsername} onChange={(e) => setResetUsername(e.target.value)} /></div>
        {resetMessage && <p role="status" className="text-sm text-muted-foreground">{resetMessage}</p>}
        <Button className="w-full" disabled={resetBusy}>{resetBusy ? "Sending…" : "Send reset link"}</Button>
      </form>
    </DialogContent></Dialog>
  </>;
}