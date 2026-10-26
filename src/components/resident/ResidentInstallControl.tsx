import { useEffect, useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function ResidentInstallControl() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(display.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const done = () => { setInstalled(true); setPrompt(null); };
    update();
    display.addEventListener("change", update);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => { display.removeEventListener("change", update); window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", done); };
  }, []);
  if (installed) return null;
  return <section className="mb-5 flex flex-col items-start gap-3 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-center gap-3"><Smartphone className="size-5 shrink-0 text-primary" /><h2 className="text-sm font-semibold">SmatraPay on your phone</h2></div>
    <Button variant="outline" className="min-h-11" disabled={busy} onClick={async () => {
      if (!prompt) { setOpen(true); return; }
      setBusy(true); setError("");
      try { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
      catch { setError("Installation could not open. Use your browser’s Add to Home Screen option."); setOpen(true); }
      finally { setBusy(false); }
    }}><Download />{busy ? "Opening…" : "Install app"}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Install SmatraPay</DialogTitle><DialogDescription>Open apps.smatrapay.com in your phone’s browser.</DialogDescription></DialogHeader>
      <div className="space-y-4 text-sm"><p><strong>iPhone:</strong> In Safari, tap <Share className="inline size-4" aria-label="Share" /> Share, then Add to Home Screen.</p><p><strong>Android:</strong> In Chrome, open the browser menu, then Install app or Add to Home Screen.</p><p className="text-muted-foreground">Payments and account changes need an internet connection. Installation and offline access cannot be tested inside this preview.</p>{error && <p role="alert" className="text-destructive">{error}</p>}</div>
      <Button className="min-h-11" onClick={() => setOpen(false)}>Done</Button>
    </DialogContent></Dialog>
  </section>;
}