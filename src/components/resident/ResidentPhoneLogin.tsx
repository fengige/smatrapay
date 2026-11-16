import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { requestResidentPhoneOtp, verifyResidentPhoneOtp } from "@/lib/resident-phone.functions";
import { PHONE_CODE_MESSAGE, normalizeResidentPhone } from "@/lib/resident-phone";

export function ResidentPhoneLogin({ disabled, onSignedIn }: { disabled: boolean; onSignedIn: () => Promise<unknown> }) {
  const request = useServerFn(requestResidentPhoneOtp);
  const verify = useServerFn(verifyResidentPhoneOtp);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [expires, setExpires] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => { setCooldown(s => Math.max(0, s - 1)); setExpires(s => Math.max(0, s - 1)); }, 1000);
    return () => clearInterval(timer);
  }, []);
  async function send() {
    if (busy || cooldown > 0) return;
    setError(null); setBusy(true);
    try {
      const result = await request({ data: { phone: normalizeResidentPhone(phone) } });
      setChallenge(result.challenge); setCooldown(result.resendAfter); setExpires(result.expiresIn); setCode("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not request a code. Try again later."); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) { await send(); return; }
    if (busy || expires === 0) return;
    setBusy(true); setError(null);
    try {
      const session = await verify({ data: { challenge, code } });
      const result = await supabase.auth.setSession(session);
      if (result.error) throw new Error("Could not establish your session. Request a new code.");
      await onSignedIn();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not verify the code."); }
    finally { setBusy(false); }
  }
  if (!open) return <Button variant="outline" className="h-11 w-full gap-2" disabled={disabled} onClick={() => setOpen(true)}><Phone className="size-4" />Sign in with Phone Number</Button>;
  return <form onSubmit={submit} className="space-y-3">
    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setOpen(false); setChallenge(null); setCode(""); setError(null); }}><ArrowLeft className="size-4" />Other sign-in methods</Button>
    <label className="field-label" htmlFor="resident-phone">Registered phone number</label>
    <input id="resident-phone" type="tel" inputMode="tel" autoComplete="tel" className="input-shell w-full px-3" placeholder="0712 345 678 or +254712345678" value={phone} maxLength={30} disabled={busy || Boolean(challenge)} onChange={e => setPhone(e.target.value)} required />
    {challenge && <>
      <p role="status" className="text-sm text-muted-foreground">{PHONE_CODE_MESSAGE}</p>
      <label className="field-label" htmlFor="resident-phone-code">Verification code</label>
      <input id="resident-phone-code" className="input-shell w-full px-3" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} disabled={busy || expires === 0} required pattern="[0-9]{6}" />
      <p role="status" className="text-xs text-muted-foreground">{expires > 0 ? `Code expires in ${Math.floor(expires / 60)}:${String(expires % 60).padStart(2, "0")}` : "Code expired. Request a new code."}</p>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" className="w-full" disabled={disabled || busy || Boolean(challenge && expires === 0)}>{busy && <Loader2 className="size-4 animate-spin" />}{challenge ? "Verify & sign in" : "Send verification code"}</Button>
    {challenge && <div className="flex flex-wrap justify-between gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={busy || cooldown > 0} onClick={send}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</Button>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setChallenge(null); setCode(""); setError(null); }}>Change number</Button>
    </div>}
  </form>;
}