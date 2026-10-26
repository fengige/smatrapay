import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bot,
  Building2,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Phone,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
  UserRound,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getMyAccess } from "@/lib/auth.functions";
import { ResidentPasswordLogin } from "@/components/resident/ResidentPasswordLogin";
import {
  RESIDENT_DASHBOARD,
  dashboardForRoles,
  portalById,
  visiblePortals,
  type DashboardPath,
  type PortalId,
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

const COUNTRIES = [
  { code: "+254", label: "KE" },
  { code: "+256", label: "UG" },
  { code: "+255", label: "TZ" },
  { code: "+250", label: "RW" },
  { code: "+234", label: "NG" },
  { code: "+233", label: "GH" },
  { code: "+27", label: "ZA" },
  { code: "+44", label: "UK" },
  { code: "+1", label: "US" },
];

const PORTAL_ICONS: Record<PortalId, typeof Building2> = {
  admin: ShieldCheck,
  landlord: Building2,
  vendor: Sparkles,
  agent: UserRound,
  "service-provider": Wrench,
};

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

  return async function afterLogin(expectedRole?: string) {
    const access = await loadAccess();

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
  const afterLogin = useAfterLogin();
  const [dialCode, setDialCode] = useState("+254");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const fullPhone = useMemo(() => `${dialCode}${phone.replace(/\D/g, "")}`, [dialCode, phone]);

  function validate() {
    const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
    if (!digits) return "Phone number is required";
    if (digits.length < 6 || digits.length > 14) return "Enter a valid phone number";
    return null;
  }

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    const error = validate();
    setPhoneError(error);
    if (error || sending) return;

    setSending(true);
    try {
      const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: `${dialCode}${digits}`,
      });
      if (otpError) throw otpError;
      setOtpSent(true);
      toast.success(`Verification code sent to ${dialCode}${digits}`);
    } catch (err) {
      const raw = errorMessage(err, "Could not send the verification code");
      const notEnabled =
        /phone provider|unsupported phone/i.test(raw) ||
        (typeof err === "object" &&
          err !== null &&
          (err as { code?: string }).code === "phone_provider_disabled");
      toast.error(
        notEnabled
          ? "SMS sign-in is not switched on yet. Please use Google sign-in for now."
          : raw,
      );
    } finally {
      setSending(false);
    }
  }

  const navigate = useNavigate();
  const loadAccess = useServerFn(getMyAccess);
  const [checking, setChecking] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const finishing = useRef(false);

  /** Verify session + resident role/profile server-side, then enter the Resident Portal. */
  async function finishResidentSignIn(fromGoogle: boolean): Promise<boolean> {
    if (finishing.current) return false;
    finishing.current = true;
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
      if (!decision.ok) {
        // Only act on accounts that just came through resident Google sign-in;
        // existing staff sessions are left untouched.
        if (!fromGoogle) return false;
        if (decision.reason !== "staff") await supabase.auth.signOut();
        throw new Error(decision.message);
      }
      const target = safeResidentReturn(sessionStorage.getItem(RESIDENT_RETURN_KEY));
      sessionStorage.removeItem(RESIDENT_RETURN_KEY);
      if (fromGoogle) toast.success("Signed in successfully");
      await navigate({ to: target, replace: true });
      return true;
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

  if (otpSent) {
    return (
      <OtpVerification
        phone={fullPhone}
        onBack={() => setOtpSent(false)}
        onResend={sendOtp}
        onVerified={async () => {
          await afterLogin();
        }}
      />
    );
  }

  return (
    <div className="fade-swap">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading || checking}
        className="btn-primary w-full"
      >
        {googleLoading || checking ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </button>
      {accessError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {accessError}
        </p>
      )}

      <div className="divider">or</div>
      <ResidentPasswordLogin disabled={checking || googleLoading} onSignedIn={() => finishResidentSignIn(true)} />
      <div className="divider">or</div>

      <form className="space-y-4" onSubmit={sendOtp} noValidate>
        <div>
          <label htmlFor="phone" className="field-label">
            Phone Number <span className="text-destructive">*</span>
          </label>
          <div className="flex gap-2">
            <select
              aria-label="Country code"
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value)}
              className="input-shell w-[104px] shrink-0 bg-transparent px-3 text-sm text-foreground"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label} {c.code}
                </option>
              ))}
            </select>
            <div
              className={`input-shell flex-1 ${phoneError ? "border-destructive" : ""}`}
              aria-live="polite"
            >
              <span className="input-addon">
                <Phone className="size-4" />
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (phoneError) setPhoneError(null);
                }}
                aria-invalid={Boolean(phoneError)}
                aria-describedby={phoneError ? "phone-error" : undefined}
                placeholder="Enter your phone number"
                maxLength={20}
                className="input-field"
              />
            </div>
          </div>
          {phoneError && (
            <p id="phone-error" className="mt-1 text-xs font-medium text-destructive">
              {phoneError}
            </p>
          )}
        </div>

        <button type="submit" disabled={sending} className="btn-outline w-full">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4" />}
          {sending ? "Sending code…" : "Send OTP"}
        </button>
      </form>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        Phone (SMS) sign-in is coming soon.
      </p>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing you agree to our terms and privacy policy.
      </p>
    </div>
  );
}

function OtpVerification({
  phone,
  onBack,
  onResend,
  onVerified,
}: {
  phone: string;
  onBack: () => void;
  onResend: () => Promise<void>;
  onVerified: () => Promise<void>;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(45);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const code = digits.join("");

  function setDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    setError(null);
    if (!clean) {
      setDigits((prev) => prev.map((d, i) => (i === index ? "" : d)));
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < clean.length && index + i < 6; i += 1) {
        next[index + i] = clean[i]!;
      }
      return next;
    });
    const nextIndex = Math.min(index + clean.length, 5);
    inputs.current[nextIndex]?.focus();
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (verifying) return;
    if (code.length !== 6) {
      setError("Enter the full 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone,
        token: code,
        type: "sms",
      });
      if (verifyError) {
        const message = /expired/i.test(verifyError.message)
          ? "That code has expired. Request a new one."
          : "That code is incorrect. Please try again.";
        setError(message);
        return;
      }
      await onVerified();
    } catch (err) {
      setError(errorMessage(err, "Verification failed"));
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    if (resending || seconds > 0) return;
    setResending(true);
    try {
      await onResend();
      setDigits(Array(6).fill(""));
      setSeconds(45);
      inputs.current[0]?.focus();
    } finally {
      setResending(false);
    }
  }

  return (
    <form className="fade-swap space-y-5" onSubmit={verify} noValidate>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Change number
      </button>

      <div>
        <h3 className="text-base font-bold text-foreground">Verify your number</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a 6-digit code to <span className="font-semibold text-foreground">{phone}</span>
        </p>
      </div>

      <div className="flex justify-between gap-2" role="group" aria-label="Verification code">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputs.current[index] = el;
            }}
            value={digit}
            onChange={(e) => setDigit(index, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[index] && index > 0) {
                inputs.current[index - 1]?.focus();
              }
              if (e.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
              if (e.key === "ArrowRight" && index < 5) inputs.current[index + 1]?.focus();
            }}
            onPaste={(e) => {
              e.preventDefault();
              setDigit(0, e.clipboardData.getData("text"));
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={`Digit ${index + 1}`}
            maxLength={1}
            className="otp-box"
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <button type="submit" disabled={verifying} className="btn-primary w-full">
        {verifying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {verifying ? "Verifying…" : "Verify & continue"}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        {seconds > 0 ? (
          <>Resend code in {seconds}s</>
        ) : (
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="font-semibold text-primary hover:underline"
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
        )}
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

function StaffAuth() {
  const afterLogin = useAfterLogin();
  const [portal, setPortal] = useState<PortalId | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string | undefined; password?: string | undefined }>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const selected = portal ? portalById(portal) : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      toast.error("Please select a portal first");
      return;
    }
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
      await afterLogin(selected.role);
    } catch (err) {
      toast.error(errorMessage(err, "Sign in failed"));
    } finally {
      setLoading(false);
    }
  }

  if (!selected) {
    return (
      <div className="fade-swap">
        <p className="field-label">
          Select Portal <span className="text-destructive">*</span>
        </p>
        <div className="grid gap-2">
          {visiblePortals().map((p) => {
            const Icon = PORTAL_ICONS[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPortal(p.id)}
                className="portal-card"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-semibold text-foreground">{p.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Choose your portal to continue to sign in.
        </p>
      </div>
    );
  }

  return (
    <div className="fade-swap">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-muted/50 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="size-4 text-primary" />
          {selected.label} portal
        </span>
        <button
          type="button"
          onClick={() => setPortal(null)}
          className="text-xs font-medium text-primary hover:underline"
        >
          Change
        </button>
      </div>

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
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"
      />
    </svg>
  );
}

export { RESIDENT_DASHBOARD };
