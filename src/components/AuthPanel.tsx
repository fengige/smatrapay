import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bot, Eye, EyeOff, Lock, LogIn, Mail, ShieldHalf, User, Zap } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

const features = [
  { icon: Bot, text: "Cards, mobile money, bank transfers & wallets" },
  { icon: ShieldHalf, text: "PCI-grade security — 2FA, API keys, SSO ready" },
  { icon: Zap, text: "Instant settlements · Real-time reconciliation" },
];

export function AuthPanel() {
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/users" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { name },
          },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/users" });
        else toast.success("Check your email to confirm your account.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/users" });
  }

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <section className="relative isolate flex flex-1 items-center overflow-hidden bg-brand-panel px-8 py-16 lg:px-16">
        <div className="orb orb-1" aria-hidden="true" />
        <div className="orb orb-2" aria-hidden="true" />
        <div className="orb orb-3" aria-hidden="true" />

        <div className="relative z-10 w-full max-w-xl">
          <img src={logo} alt="SmatraPay" className="h-9 w-auto" />

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

      <section className="flex flex-1 items-center justify-center bg-background px-6 py-16">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to your SmatraPay dashboard"
              : "Get started with SmatraPay in seconds"}
          </p>

          <div className="mt-6 flex gap-2">
            <button type="button" className="btn-outline flex-1" onClick={handleGoogle}>
              Google
            </button>
          </div>

          <div className="divider">or {mode === "signin" ? "sign in" : "sign up"} with email</div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <div>
                <label htmlFor="name" className="field-label">
                  Full Name
                </label>
                <div className="input-shell">
                  <span className="input-addon">
                    <User className="size-4" />
                  </span>
                  <input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Wanjiku"
                    maxLength={120}
                    className="input-field"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="field-label">
                Email Address <span className="text-destructive">*</span>
              </label>
              <div className="input-shell">
                <span className="input-addon">
                  <Mail className="size-4" />
                </span>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  maxLength={255}
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="password" className="field-label mb-0">
                  Password <span className="text-destructive">*</span>
                </label>
              </div>
              <div className="input-shell">
                <span className="input-addon">
                  <Lock className="size-4" />
                </span>
                <input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              <LogIn className="size-4" />
              {loading
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign In to Dashboard"
                  : "Create free account"}
            </button>
          </form>

          <div className="divider" />

          <p className="text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              className="font-bold text-primary hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Create free account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
