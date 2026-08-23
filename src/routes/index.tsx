import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Eye, EyeOff, Lock, LogIn, Mail, ShieldHalf, Zap } from "lucide-react";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in to SmatraPay" },
      {
        name: "description",
        content:
          "Sign in to your SmatraPay dashboard to manage payments, payouts and real-time transaction insights.",
      },
      { property: "og:title", content: "Sign in to SmatraPay" },
      {
        property: "og:description",
        content:
          "Access your SmatraPay dashboard: secure payments, instant payouts and real-time insights.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

const features = [
  { icon: Bot, text: "Cards, mobile money, bank transfers & wallets" },
  { icon: ShieldHalf, text: "PCI-grade security — 2FA, API keys, SSO ready" },
  { icon: Zap, text: "Instant settlements · Real-time reconciliation" },
];

function LoginPage() {
  const [showPwd, setShowPwd] = useState(false);

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Left brand panel */}
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

      {/* Right form panel */}
      <section className="flex flex-1 items-center justify-center bg-background px-6 py-16">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your SmatraPay dashboard</p>

          <div className="mt-6 flex gap-2">
            <button type="button" className="btn-outline flex-1">
              Google
            </button>
            <button type="button" className="btn-outline flex-1">
              GitHub
            </button>
          </div>

          <div className="divider">or sign in with email</div>

          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
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
                  placeholder="you@company.com"
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="password" className="field-label mb-0">
                  Password <span className="text-destructive">*</span>
                </label>
                <a href="#" className="text-xs font-medium text-primary hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className="input-shell">
                <span className="input-addon">
                  <Lock className="size-4" />
                </span>
                <input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  required
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

            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                defaultChecked
                className="size-4 rounded border-border accent-primary"
              />
              <label htmlFor="remember" className="cursor-pointer text-sm text-foreground">
                Remember me for 30 days
              </label>
            </div>

            <button type="submit" className="btn-primary w-full">
              <LogIn className="size-4" />
              Sign In to Dashboard
            </button>
          </form>

          <div className="divider" />

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href="#" className="font-bold text-primary hover:underline">
              Create free account
            </a>
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            <a href="#" className="hover:underline">
              Sign in with 2FA instead
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
