import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search, ShieldCheck, Loader2, History, ArrowLeft, Globe } from "lucide-react";
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
    { name: "description", content: "Verify your SmatraPay meter and securely check your three most recent prepaid tokens." },
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
      if (request === generation.current) setHistoryError(e instanceof Error ? e.message : "Could not load recent tokens. Please try again or contact the administrator.");
    } finally { if (request === generation.current) setBusy(null); }
  }
  return <div className="relative min-h-screen bg-background text-foreground">
    <div aria-hidden className="pointer-events-none fixed inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bgAsset.url})` }} />
    <div aria-hidden className="pointer-events-none fixed inset-0 bg-background/60 dark:bg-background/88" />
    <div aria-hidden className="brand-wash pointer-events-none fixed inset-0" />
    <header className="relative border-b border-border bg-card"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
      <Link to="/" aria-label="SmatraPay home"><img src={logoAsset.url} alt="SmatraPay" className="h-8 w-auto" /></Link>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3"><Link to="/" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">Home</Link><Button asChild variant="ghost" className="px-3 text-xs sm:px-5 sm:text-sm"><a href="https://smatrapay.com/" target="_blank" rel="noopener noreferrer"><Globe className="h-4 w-4" /><span className="hidden lg:inline">smatrapay.com</span><span className="lg:hidden">Main site</span></a></Button><Button asChild className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/mytokens">Token Checker</Link></Button><Button asChild className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/vendor-register">Become a Vendor</Link></Button><Button variant="outline" asChild className="px-3 text-xs sm:px-5 sm:text-sm"><Link to="/login">Log in</Link></Button></div>
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
          <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-success" />Meter verified</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Meter number</dt><dd className="mt-1 break-all font-semibold">{meter.meter_number}</dd></div><div><dt className="text-muted-foreground">Meter type</dt><dd className="mt-1 capitalize">{meter.type}</dd></div></dl>
          <Button onClick={history} disabled={busy === "history"} className="mt-6"><History className="h-4 w-4" />View Recent Tokens{busy === "history" && <Loader2 className="h-4 w-4 animate-spin" />}</Button>
        </section>}
        {meter && historyError && <div className="mt-5 space-y-3"><p role="alert" className="text-sm text-destructive">{historyError}</p><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={history}>Try again</Button></div></div>}
        {(missing || historyError) && <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          {support?.email && <p><a className="text-primary underline" href={`mailto:${encodeURIComponent(support.email)}`}>{support.email}</a></p>}
          {support?.phone && <p><a className="text-primary underline" href={`tel:${support.phone.replace(/[^+\d]/g, "")}`}>{support.phone}</a></p>}
        </div>}
        {meter && tokens && <section className="mt-8"><h2 className="text-xl font-semibold">Recent Token Transactions</h2>
          {!tokens.length ? <p className="mt-4 text-muted-foreground">No recent token purchases were found for your meter.</p> : <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Date / Time (EAT)</th><th className="px-4 py-3 font-medium">Unit Name</th><th className="px-4 py-3 font-medium">Meter</th><th className="px-4 py-3 font-medium">Token</th><th className="px-4 py-3 text-right font-medium">Units</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 font-medium">Reference</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{tokens.map((t, i) => <tr key={`${t.date}-${i}`}>
              <td className="whitespace-nowrap px-4 py-3"><time>{new Date(t.date).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}</time></td>
              <td className="px-4 py-3">{t.unit ?? "—"}</td>
              <td className="whitespace-nowrap px-4 py-3">{t.meter}</td>
              <td className="px-4 py-3">{t.token ? <span className="break-all font-mono text-primary">{t.token}</span> : <span className="capitalize text-muted-foreground">{t.status}</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">{t.units.toLocaleString("en-KE", { maximumFractionDigits: 3 })}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">KES {t.amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
              <td className="px-4 py-3">{t.reference ?? "—"}</td>
            </tr>)}</tbody>
          </table></div>}
        </section>}
      </div>
      </div>
    </main>
  </div>;
}