import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Headset, Send } from "lucide-react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { askResidentSupport } from "@/lib/resident-portal.functions";
import { Card, field, residentHead } from "@/components/resident/ResidentUI";
import { EnquiryPanel } from "@/components/resident/EnquiryPanel";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/resident/support")({
  head: residentHead("Resident Support", "Ask the SmatraPay assistant about Pay-as-you-go instalments, payments, tokens and requests, or contact a person."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load support.</p>,
});

type Msg = { role: "user" | "assistant"; content: string };
const STARTERS = ["What is left to pay on my Pay-as-you-go plan?", "How do I pay my next instalment?", "My instalment payment is pending", "How do I buy a token?", "My payment went through but I got no token", "How do I pay rent?", "What's the status of my request?", "Which meters are on my account?"];

function Page() {
  const access = Route.useLoaderData();
  const askFn = useServerFn(askResidentSupport);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: "Hi! I'm SmatraPay Resident Support. Ask me about Pay-as-you-go instalments, tokens, your meters, payments or maintenance requests." }]);
  const [text, setText] = useState("");
  const ask = useMutation({
    mutationFn: (history: Msg[]) => askFn({ data: { messages: history.slice(1) } }),
    onSuccess: (r) => setMsgs((m) => [...m, { role: "assistant", content: r.reply }]),
    onError: (e) => toast.error((e as Error).message),
  });
  const send = (t: string) => {
    if (!t.trim() || ask.isPending) return;
    const next = [...msgs, { role: "user" as const, content: t.trim() }];
    setMsgs(next); setText(""); ask.mutate(next);
  };
  return (
    <DashboardShell access={access} title="Resident Support" description="Answers use your own account data. The assistant can't make payments or change records.">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <div className="flex h-[calc(100dvh-17rem)] min-h-[360px] flex-col lg:h-[480px]">
            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground" : "flex max-w-[90%] gap-2 text-sm"}>
                  {m.role === "assistant" && <Headset className="mt-0.5 size-5 shrink-0 text-primary" />}
                  {m.role === "assistant" ? <div className="prose prose-sm max-w-none text-foreground"><ReactMarkdown>{m.content}</ReactMarkdown></div> : m.content}
                </div>
              ))}
              {ask.isPending && <p className="text-xs text-muted-foreground">Thinking…</p>}
              {msgs.length === 1 && <div className="flex flex-wrap gap-2">{STARTERS.map((s) => <Button key={s} variant="outline" className="min-h-11 h-auto whitespace-normal px-3 text-left text-xs" onClick={() => send(s)}>{s}</Button>)}</div>}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <input autoFocus className={field} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about instalments, tokens or repairs…" aria-label="Message" />
              <Button type="submit" className="min-h-11 min-w-11 px-3" disabled={!text.trim() || ask.isPending} aria-label="Send"><Send className="size-4" /></Button>
            </form>
          </div>
        </Card>
        <EnquiryPanel kind="support" title="Contact support" />
      </div>
    </DashboardShell>
  );
}

