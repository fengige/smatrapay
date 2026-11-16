import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bot,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Phone,
  ShieldCheck,
  ShieldHalf,
  UserRound,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getMyAccess } from "@/lib/auth.functions";
import { verifyResidentGoogle } from "@/lib/resident-google.functions";
import { isGoogleSession } from "@/lib/resident-google";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { ResidentPasswordLogin } from "@/components/resident/ResidentPasswordLogin";
import { ResidentPhoneLogin } from "@/components/resident/ResidentPhoneLogin";
import {
  RESIDENT_DASHBOARD,
  dashboardForRoles,
  PORTALS,
  type DashboardPath,
} from "@/lib/portals";
import {
  RESIDENT_RETURN_KEY,
  oauthErrorMessage,
  residentDecision,
  safeResidentReturn,
} from "@/lib/resident-signin";

const GOOGLE_PENDING_KEY = "sp_google_pending";

const features = [
  { icon: Bot, text: "Cards, mobile money, bank transfers & wallets" },
  { icon: ShieldHalf, text: "PCI-grade security — 2FA, API keys, SSO ready" },
  { icon: Zap, text: "Instant settlements · Real-time reconciliation" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function AuthPanel() {
  const [tab, setTab] = useState<"resident" | "staff">("resident");

  return (
    <main className={`flex min-h-screen min-w-0 flex-col lg:flex-row ${tab === "resident" ? "resident-signin" : ""}`}>
      {/* Left brand panel (unchanged) */}
      <section className={`relative isolate flex min-w-0 flex-1 items-center overflow-hidden bg-brand-panel px-8 py-16 lg:px-16 ${tab === "resident" ? "resident-signin-brand" : ""}`}>
        <div className="orb orb-1" aria-hidden="true" />
        <div className="orb orb-2" aria-hidden="true" />
        <div className="orb orb-3" aria-hidden="true" />

        <div className="relative z-10 w-full max-w-xl">
          <div className="flex min-w-0 flex-col">
            <img src={logo} alt="SmatraPay" className="h-7 w-auto self-start" />
            <p className="mt-2 truncate text-[0.65rem] font-extrabold uppercase tracking-[0.22em] text-panel-muted">
              Secure Portal
            </p>
          </div>

          <h1 className="mt-14 text-4xl font-bold leading-tight tracking-tight text-panel-foreground lg:text-5xl">
            The payments platform that{" "}
            <span className="bg-brand-gradient bg-clip-text text-transparent">moves with you</span>
          </h1>
          <p className="mt-4 text-sm text-panel-muted">
            Seamless checkout · Instant payouts · Secure by design · Built for African businesses
          </p>

          <ul className="mt-10 space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-panel-muted">
                <span className="flex size-9 items-center justify-center rounded-xl bg-panel-tile">
                  <Icon className="size-4 text-accent" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Right auth panel */}
      <section className="flex min-w-0 flex-1 items-center justify-center bg-background px-6 py-12 sm:px-10">
        <div className="w-full min-w-0 max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose how you want to sign in to SmatraPay
          </p>

          <div
            role="tablist"
            aria-label="Account type"
            className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
          >
            {(["resident", "staff"] as const).map((value) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`segment ${tab === value ? "segment-active" : ""}`}
              >
                {value === "resident" ? (
                  <UserRound className="size-4" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {value === "resident" ? "Resident" : "Staff"}
              </button>
            ))}
          </div>

          <div key={tab} className="fade-swap mt-6">
            {tab === "resident" ? <ResidentAuth /> : <StaffAuth />}
          </div>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Shared post-login routing                                           */
/* ------------------------------------------------------------------ */

function useAfterLogin() {
  const navigate = useNavigate();
  const loadAccess = useServerFn(getMyAccess);

  return async function afterLogin(expectedRole?: string, staffOnly = false) {
    const access = await loadAccess();

    if (staffOnly && !access.roles.some((r) => PORTALS.some((p) => p.role === r))) {
      await supabase.auth.signOut();
      throw new Error("This account does not have staff access. Residents should use the Resident tab.");
    }

    if (expectedRole && !access.roles.includes(expectedRole)) {
      await supabase.auth.signOut();
      throw new Error(
        "This account does not have access to the selected portal. Please select the correct portal.",
      );
    }
    if (access.profile?.status === "suspended" || access.profile?.status === "inactive") {
      await supabase.auth.signOut();
      throw new Error("Your account is not active. Please contact support.");
    }

    const target: DashboardPath = expectedRole
      ? dashboardForRoles([expectedRole])
      : dashboardForRoles(access.roles);
    toast.success("Signed in successfully");
    await navigate({ to: target });
  };
}

/* ------------------------------------------------------------------ */
/* Resident                                                            */
/* ------------------------------------------------------------------ */

function ResidentAuth() {
  const verifyGoogle = useServerFn(verifyResidentGoogle);
  const queryClient = useQueryClient();
  const [googleLoading, setGoogleLoading] = useState(false);

  const navigate = useNavigate();
  const loadAccess = useServerFn(getMyAccess);
  const [checking, setChecking] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const finishing = useRef(false);

  /** Verify session + resident role/profile server-side, then enter the Resident Portal. */
  async function finishResidentSignIn(fromGoogle: boolean): Promise<boolean> {
    if (finishing.current) return false;
    finishing.current = true;
    let googleAttempt = fromGoogle;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        if (fromGoogle) throw new Error("We couldn't establish your session. Please try again.");
        return false;
      }
      let access;
      try {
        access = await loadAccess();
      } catch {
        throw new Error("We couldn't verify your resident account. Please try again.");
      }
      const decision = residentDecision(access);
      if (!fromGoogle && !decision.ok && decision.reason === "staff") return false;
      const verifiedClaims = await supabase.auth.getClaims();
      googleAttempt ||= isGoogleSession(data.user, verifiedClaims.data?.claims ?? {});
      if (googleAttempt) await verifyGoogle();
      if (!decision.ok) {
        // Only act on accounts that just came through resident Google sign-in;
        // existing staff sessions are left untouched.
        if (!googleAttempt) return false;
        throw new Error(decision.message);
      }
      const target = safeResidentReturn(sessionStorage.getItem(RESIDENT_RETURN_KEY));
      sessionStorage.removeItem(RESIDENT_RETURN_KEY);
      if (fromGoogle) toast.success("Signed in successfully");
      await navigate({ to: target, replace: true });
      return true;
    } catch (err) {
      if (googleAttempt) {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
      }
      throw err;
    } finally {
      finishing.current = false;
    }
  }

  // Handles the return from Google (full-page redirect) and revisits while signed in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const oauthError = oauthErrorMessage(
        url.searchParams.get("error") ?? hash.get("error"),
        url.searchParams.get("error_description") ?? hash.get("error_description"),
      );
      const fromGoogle = sessionStorage.getItem(GOOGLE_PENDING_KEY) === "1";
      sessionStorage.removeItem(GOOGLE_PENDING_KEY);
      if (oauthError) {
        setAccessError(oauthError);
        toast.error(oauthError);
        window.history.replaceState(null, "", url.pathname);
        setChecking(false);
        return;
      }
      try {
        await finishResidentSignIn(fromGoogle);
      } catch (err) {
        if (!cancelled) {
          const msg = errorMessage(err, "Google sign-in failed");
          setAccessError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogle() {
    setGoogleLoading(true);
    setAccessError(null);
    try {
      const requested = new URL(window.location.href).searchParams.get("redirect");
      sessionStorage.setItem(RESIDENT_RETURN_KEY, safeResidentReturn(requested));
      sessionStorage.setItem(GOOGLE_PENDING_KEY, "1");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        sessionStorage.removeItem(GOOGLE_PENDING_KEY);
        const msg = String((result.error as { message?: string }).message ?? "");
        throw new Error(
          /cancel|closed|denied/i.test(msg)
            ? "Google sign-in was cancelled. You can try again."
            : "Google sign-in failed. Please try again.",
        );
      }
      if (result.redirected) return;
      sessionStorage.removeItem(GOOGLE_PENDING_KEY);
      await finishResidentSignIn(true);
    } catch (err) {
      const msg = errorMessage(err, "Google sign-in failed");
      setAccessError(msg);
      toast.error(msg);
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="fade-swap">
      <ResidentPasswordLogin disabled={checking || googleLoading} onSignedIn={() => finishResidentSignIn(false)} />
      <div className="divider">or</div>
      <Button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading || checking}
        variant="google"
        className="h-11 w-full gap-2.5 px-3 [&_svg]:size-[18px]"
      >
        {googleLoading || checking ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </Button>
      {accessError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {accessError}
        </p>
      )}

      <div className="divider">or</div>

      <ResidentPhoneLogin disabled={checking || googleLoading} onSignedIn={() => finishResidentSignIn(false)} />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing you agree to our terms and privacy policy.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

function StaffAuth() {
  const afterLogin = useAfterLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string | undefined; password?: string | undefined }>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = "Email address is required";
    else if (!EMAIL_RE.test(email.trim())) nextErrors.email = "Enter a valid email address";
    if (!password) nextErrors.password = "Password is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || loading) return;

    setLoading(true);
    try {
      localStorage.setItem("sp_remember", remember ? "1" : "0");
      sessionStorage.setItem("sp_active", "1");

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        throw new Error(
          /invalid login/i.test(error.message)
            ? "Incorrect email or password. Please try again."
            : error.message,
        );
      }
      await afterLogin(undefined, true);
    } catch (err) {
      toast.error(errorMessage(err, "Sign in failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fade-swap">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="staff-email" className="field-label">
            Email Address <span className="text-destructive">*</span>
          </label>
          <div className={`input-shell ${errors.email ? "border-destructive" : ""}`}>
            <span className="input-addon">
              <Mail className="size-4" />
            </span>
            <input
              id="staff-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
              }}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "staff-email-error" : undefined}
              placeholder="you@company.com"
              maxLength={255}
              className="input-field"
            />
          </div>
          {errors.email && (
            <p id="staff-email-error" className="mt-1 text-xs font-medium text-destructive">
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="staff-password" className="field-label mb-0">
              Password <span className="text-destructive">*</span>
            </label>
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className={`input-shell ${errors.password ? "border-destructive" : ""}`}>
            <span className="input-addon">
              <Lock className="size-4" />
            </span>
            <input
              id="staff-password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
              }}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "staff-password-error" : undefined}
              placeholder="Your password"
              className="input-field"
            />
            <button
              type="button"
              aria-label={showPwd ? "Hide password" : "Show password"}
              onClick={() => setShowPwd((v) => !v)}
              className="input-addon transition-colors hover:text-foreground"
            >
              {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && (
            <p id="staff-password-error" className="mt-1 text-xs font-medium text-destructive">
              {errors.password}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 rounded border-border accent-primary"
          />
          <label htmlFor="remember" className="cursor-pointer text-sm text-foreground">
            Remember me for 30 days
          </label>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          {loading ? "Signing in…" : "Sign In to Dashboard"}
        </button>
      </form>

      {forgotOpen && <ForgotPasswordDialog onClose={() => setForgotOpen(false)} />}
    </div>
  );
}

function ForgotPasswordDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    setSending(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      toast.error(errorMessage(err, "Could not send the reset email"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fade-swap w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h3 id="forgot-title" className="text-lg font-bold text-foreground">
          Reset your password
        </h3>
        {sent ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              If an account exists for <span className="font-semibold">{email}</span>, a password
              reset link is on its way. Check your inbox and spam folder.
            </p>
            <button type="button" onClick={onClose} className="btn-primary mt-5 w-full">
              Back to sign in
            </button>
          </>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="forgot-email" className="field-label">
                Email Address <span className="text-destructive">*</span>
              </label>
              <div className={`input-shell ${error ? "border-destructive" : ""}`}>
                <span className="input-addon">
                  <Mail className="size-4" />
                </span>
                <input
                  id="forgot-email"
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="you@company.com"
                  maxLength={255}
                  className="input-field"
                />
              </div>
              {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-outline flex-1">
                Cancel
              </button>
              <button type="submit" disabled={sending} className="btn-primary flex-1">
                {sending && <Loader2 className="size-4 animate-spin" />}
                {sending ? "Sending…" : "Send reset link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

export { RESIDENT_DASHBOARD };
