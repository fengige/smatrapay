import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { submitFeedback } from "@/lib/resident-portal.functions";
import { FEEDBACK_CATEGORIES } from "@/lib/resident-portal";
import { Card, field, residentHead } from "@/components/resident/ResidentUI";

export const Route = createFileRoute("/_authenticated/resident/feedback")({
  head: residentHead("Surveys & Feedback", "Rate maintenance, service providers, payments and the portal."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load feedback.</p>,
});

function Page() {
  const access = Route.useLoaderData();
  const fn = useServerFn(submitFeedback);
  const [f, setF] = useState({ category: FEEDBACK_CATEGORIES[0] as (typeof FEEDBACK_CATEGORIES)[number], rating: 0, comment: "" });
  const m = useMutation({ mutationFn: () => fn({ data: f }), onSuccess: () => { toast.success("Thanks for your feedback"); setF({ ...f, rating: 0, comment: "" }); }, onError: (e) => toast.error((e as Error).message) });
  return (
    <DashboardShell access={access} title="Surveys & Feedback" description="Tell us how we're doing. Please don't include passwords, PINs or ID numbers.">
      <div className="max-w-xl"><Card>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <label className="block text-sm">Topic<select className={`${field} mt-1`} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as never })}>{FEEDBACK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <div className="text-sm">Rating
            <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} role="radio" aria-checked={f.rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setF({ ...f, rating: n })}>
                  <Star className={`size-7 ${n <= f.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm">Comments (optional)<textarea className={`${field} mt-1 h-24 py-2`} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} maxLength={1000} /></label>
          <button className="btn-primary" disabled={!f.rating || m.isPending}>{m.isPending ? "Sending…" : "Submit feedback"}</button>
        </form>
      </Card></div>
    </DashboardShell>
  );
}
