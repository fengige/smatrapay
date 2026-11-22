import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search, ShieldCheck, Loader2, History, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyPublicMeter, recentCheckedTokens } from "@/lib/token-checker.functions";
import { publicMeterSchema, type CheckedMeter, type SafeToken } from "@/lib/meter-search";
import logoAsset from "@/assets/smatrapay-logo.png.asset.json";
import bgAsset from "@/assets/smatrapay-bg.webp.asset.json";

export const Route = createFileRoute("/mytokens")({
  head: () => ({ meta: [
    { title: "Token Checker · SmatraPay" },
    { name: "description", content: "Verify your SmatraPay meter and securely check your five most recent prepaid tokens." },
    { property: "og:title", content: "Token Checker · SmatraPay" },
    { property: "og:description", content: "Check your meter and recent prepaid tokens with SmatraPay." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: TokenChecker,
});

function TokenChecker() {
  const verify = useServerFn(verifyPublicMeter);
  const readTokens = useServerFn(recentCheckedTokens);
  const [number, setNumber] = useState("");
  const [meter, setMeter] = useState<CheckedMeter | null>(null);
  const [support, setSupport] = useState<{ email: string | null; phone: string | null } | null>(null);
  const [tokens, setTokens] = useState<SafeToken[] | null>(null);
  const [busy, setBusy] = useState<"search" | "history" | null>(null);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [missing, setMissing] = useState(false);
  const generation = useRef(0);
  function reset() {
    generation.current += 1; setMeter(null); setTokens(null); setMissing(false);
    setError(""); setHistoryError(""); setBusy(null);
  }
  async function search(event: React.FormEvent) {
    event.preventDefault(); reset();
    const parsed = publicMeterSchema.safeParse({ meter_number: number });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Enter your meter number."); return; }
    const request = generation.current; setBusy("search");
    try {
      const result = await verify({ data: parsed.data });
      if (request !== generation.current) return;
      setMeter(result.meter); setSupport(result.support); setMissing(!result.meter);
    } catch { if (request === generation.current) setError("Meter verification is unavailable. Please try again."); }
    finally { if (request === generation.current) setBusy(null); }
  }
  async function history() {
    if (!meter) return;
    const request = generation.current; setBusy("history"); setHistoryError(""); setTokens(null);
    try {
      const rows = await readTokens({ data: { meter_number: meter.meter_number } });
      if (request === generation.current) setTokens(rows);
    } catch (e) {
      if (request === generation.current) setHistoryError(e instanceof Error && /linked|resident account|active resident/.test(e.message)
        ? e.message : "Sign in to your resident account to view tokens. If already signed in, try again or contact the administrator.");
    } finally { if (request === generation.current) setBusy(null); }
  }
  return <div className="relative min-h-screen bg-background text-foreground">
    <div aria-hidden className="pointer-events-none fixed inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bgAsset.url})` }} />
    <div aria-hidden className="pointer-events-none fixed inset-0 bg-background/60 dark:bg-background/88" />
    <div aria-hidden className="brand-wash pointer-events-none fixed inset-0" />
    <header className="relative border-b border-border bg-card"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
      <Link to="/" aria-label="SmatraPay home"><img src={logoAsset.url} alt="SmatraPay" className="h-8 w-auto" /></Link>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3"><Link to="/" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">Home</Link><Button asChild className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/mytokens">Token Checker</Link></Button><Button asChild className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/vendor-register">Become a Vendor</Link></Button><Button variant="outline" asChild className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/login">Log in</Link></Button></div>
    </div></header>
    <main className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
      <h1 className="text-4xl font-normal tracking-tight sm:text-6xl">Lost your token? <span className="font-bold">Find it here.</span></h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">Your latest tokens, looked up with your meter number.</p>
      <form onSubmit={search} className="mt-8 rounded-3xl bg-muted p-5 sm:p-9">
        <Label htmlFor="meter-number" className="sr-only">Meter number</Label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input id="meter-number" value={number} maxLength={64} autoComplete="off" placeholder="Meter number" className="h-12 rounded-xl bg-background" onChange={e => { reset(); setNumber(e.target.value); }} />
          <Button type="submit" disabled={busy === "search"} className="h-12 rounded-full px-6 font-semibold"><Search className="h-4 w-4" />{busy === "search" ? "Searching…" : "Find my token"}</Button>
        </div>
      </form>
      <div className="max-w-3xl">
      <div aria-live="polite" className="mt-6">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {missing && <div className="border-l-2 border-destructive pl-4"><h2 className="font-semibold">Meter could not be verified</h2><p className="mt-2 text-sm text-muted-foreground">Please consult the SmatraPay administrator for assistance.</p></div>}
        {meter && <section className="border-y border-border py-6">
          <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary" />Meter verified</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Meter number</dt><dd className="mt-1 break-all font-semibold">{meter.meter_number}</dd></div><div><dt className="text-muted-foreground">Meter type</dt><dd className="mt-1 capitalize">{meter.type}</dd></div></dl>
          <Button onClick={history} disabled={busy === "history"} className="mt-6"><History className="h-4 w-4" />View Recent Tokens{busy === "history" && <Loader2 className="h-4 w-4 animate-spin" />}</Button>
        </section>}
        {meter && historyError && <div className="mt-5 space-y-3"><p role="alert" className="text-sm text-destructive">{historyError}</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/login">Resident sign-in</Link></Button><Button variant="ghost" onClick={history}>Try again</Button></div></div>}
        {(missing || historyError) && <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          {support?.email && <p><a className="text-primary underline" href={`mailto:${encodeURIComponent(support.email)}`}>{support.email}</a></p>}
          {support?.phone && <p><a className="text-primary underline" href={`tel:${support.phone.replace(/[^+\d]/g, "")}`}>{support.phone}</a></p>}
        </div>}
        {meter && tokens && <section className="mt-8"><h2 className="text-xl font-semibold">Recent tokens</h2>
          {!tokens.length ? <p className="mt-4 text-muted-foreground">No recent token purchases were found for your meter.</p> : <div className="mt-4 divide-y divide-border">{tokens.map((t, i) => <article key={`${t.date}-${i}`} className="py-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><time>{new Date(t.date).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</time><span className="capitalize text-muted-foreground">{t.status}</span></div>
            <div className="mt-3 flex flex-wrap gap-5 font-semibold"><span>KES {t.amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</span><span>{t.units.toLocaleString("en-KE", { maximumFractionDigits: 3 })} units</span></div>
            {t.token && <p className="mt-3 break-all font-mono text-lg text-primary">{t.token}</p>}
          </article>)}</div>}
        </section>}
      </div>
      </div>
    </main>
  </div>;
}