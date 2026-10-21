import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { residentMfa } from "@/lib/resident-mfa.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck } from "lucide-react";

export function ResidentMfaGate({ children }: { children: ReactNode }) {
  const [factor, setFactor] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [code, setCode] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const security = useServerFn(residentMfa);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const user = await supabase.auth.getUser();
        if (!user.data.user) { if (alive) { setFactor(null); setChecking(false); } return; }
        const roles = await supabase.from("user_roles").select("role").eq("user_id", user.data.user.id);
        const values = (roles.data ?? []).map(r => r.role);
        if (values.includes("resident") && !values.some(r => r !== "resident" && r !== "user")) {
          const [factors, assurance] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
          if (factors.error || assurance.error) throw new Error("Could not verify account security. Refresh to try again.");
          if (alive) setFactor(assurance.data.currentLevel !== "aal2" ? factors.data.totp[0]?.id ?? null : null);
        } else if (alive) setFactor(null);
      } catch { if (alive) setError("Could not verify your session. Refresh to try again."); }
      finally { if (alive) setChecking(false); }
    };
    void check();
    const subscription = supabase.auth.onAuthStateChange(event => { if (["SIGNED_IN", "SIGNED_OUT", "MFA_CHALLENGE_VERIFIED", "TOKEN_REFRESHED"].includes(event)) { setChecking(true); setTimeout(() => void check(), 0); } });
    return () => { alive = false; subscription.data.subscription.unsubscribe(); };
  }, []);
  if (checking) return <p className="p-8 text-sm text-muted-foreground">Checking account security…</p>;
  if (!factor) return <>{children}</>;
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><form className="w-full max-w-sm space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { const result = await security({ data: { action: "verify", purpose: "verify", factorId: factor, code } }); if (result.kind !== "verified") throw new Error("Verification failed."); const session = await supabase.auth.setSession(result); if (session.error) throw session.error; setCode(""); setFactor(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><ShieldCheck className="size-10 text-primary" /><h1 className="text-xl font-bold">Verify your authenticator</h1><label className="block text-sm" htmlFor="sign-in-mfa">Authentication code</label><Input id="sign-in-mfa" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} className="w-full">{busy ? "Verifying…" : "Verify"}</Button><Button variant="outline" type="button" className="w-full" onClick={() => void supabase.auth.signOut()}>Sign out</Button><p className="text-xs text-muted-foreground">Lost access to your authenticator? Contact your account administrator for identity-verified recovery.</p></form></main>;
}