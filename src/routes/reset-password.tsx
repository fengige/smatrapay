import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { verifiedRecoveryClaims } from "@/lib/resident-password";
import { completePasswordRecovery } from "@/lib/resident-password.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your SmatraPay password" },
      {
        name: "description",
        content: "Choose a new, secure password for your SmatraPay account.",
      },
      { property: "og:title", content: "Reset your SmatraPay password" },
      {
        property: "og:description",
        content: "Set a new password and get back into your SmatraPay dashboard securely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

const RULES = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "One lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "One number", test: (v: string) => /\d/.test(v) },
  { label: "One symbol", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

function ResetPasswordPage() {
  const navigate = useNavigate();
  const completeRecovery = useServerFn(completePasswordRecovery);
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const { data, error } = token ? await supabase.auth.getClaims(token) : { data: null, error: true };
      if (!active) return;
      setValid(!error && Boolean(data?.claims && verifiedRecoveryClaims(data.claims) && sessionStorage.getItem("sp_recovery_user") === data.claims.sub));
      setReady(true);
    };
    window.addEventListener("sp-password-recovery", check);
    void check();
    return () => {
      active = false;
      window.removeEventListener("sp-password-recovery", check);
    };
  }, []);

  const passed = useMemo(() => RULES.filter((r) => r.test(password)).length, [password]);
  const strength = (passed / RULES.length) * 100;
  const strengthLabel = passed <= 2 ? "Weak" : passed <= 4 ? "Good" : "Strong";
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = valid && passed === RULES.length && !mismatch && confirm.length > 0 && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await completeRecovery({ data: { password } });
      toast.success("Password updated. Please sign in.");
      sessionStorage.removeItem("sp_recovery_user");
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      await navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <img src={logo} alt="SmatraPay" className="h-8 w-auto" />
        <h1 className="mt-8 text-2xl font-bold tracking-tight text-foreground">Set a new password</h1>

        {!ready ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking your reset link…
          </p>
        ) : !valid ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <Button onClick={() => navigate({ to: "/" })} className="mt-6 w-full">
              Back to sign in
            </Button>
          </>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="new-password" className="field-label">
                New Password <span className="text-destructive">*</span>
              </label>
              <div className="input-shell">
                <span className="input-addon">
                  <Lock className="size-4" />
                </span>
                <input
                  id="new-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="input-field"
                />
                <Button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow((v) => !v)}
                  className="input-addon transition-colors hover:text-foreground"
                  variant="ghost" size="icon"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand-gradient transition-all"
                  style={{ width: `${strength}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Strength: <span className="font-semibold text-foreground">{strengthLabel}</span>
              </p>

              <ul className="mt-3 space-y-1">
                {RULES.map((rule) => {
                  const ok = rule.test(password);
                  return (
                    <li
                      key={rule.label}
                      className={`flex items-center gap-2 text-xs ${ok ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {ok ? (
                        <Check className="size-3.5 text-primary" />
                      ) : (
                        <X className="size-3.5" />
                      )}
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <label htmlFor="confirm-password" className="field-label">
                Confirm New Password <span className="text-destructive">*</span>
              </label>
              <div className={`input-shell ${mismatch ? "border-destructive" : ""}`}>
                <span className="input-addon">
                  <Lock className="size-4" />
                </span>
                <input
                  id="confirm-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={mismatch}
                  placeholder="Repeat your password"
                  className="input-field"
                />
              </div>
              {mismatch && (
                <p className="mt-1 text-xs font-medium text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
