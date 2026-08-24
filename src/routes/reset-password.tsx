import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your SmatraPay password" },
      {
        name: "description",
        content: "Choose a new, secure password for your SmatraPay staff account.",
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
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    // Supabase sets a recovery session from the emailed link.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setValid(Boolean(data.session));
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setValid(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const passed = useMemo(() => RULES.filter((r) => r.test(password)).length, [password]);
  const strength = (passed / RULES.length) * 100;
  const strengthLabel = passed <= 2 ? "Weak" : passed <= 4 ? "Good" : "Strong";
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = passed === RULES.length && !mismatch && confirm.length > 0 && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. Please sign in.");
      await supabase.auth.signOut();
      await navigate({ to: "/" });
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
            <button onClick={() => navigate({ to: "/" })} className="btn-primary mt-6 w-full">
              Back to sign in
            </button>
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
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow((v) => !v)}
                  className="input-addon transition-colors hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
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

            <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
