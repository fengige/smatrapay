import { useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type WizardStep = {
  /** Short label shown in the step bar. */
  title: string;
  /** Helper line under the heading. */
  description?: string;
  content: ReactNode;
  /** Return an error message to block moving forward. */
  validate?: () => string | null;
};

export function Wizard({
  steps,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  steps: WizardStep[];
  submitLabel: string;
  pending?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  if (!step) return null;

  const isLast = index === steps.length - 1;

  const next = () => {
    const error = step.validate?.();
    if (error) {
      toast.error(error);
      return;
    }
    if (isLast) {
      onSubmit();
      return;
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap items-center gap-2" aria-label="Progress">
        {steps.map((s, i) => {
          const done = i < index;
          const current = i === index;
          return (
            <li key={s.title} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => i < index && setIndex(i)}
                disabled={i > index}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  current
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                } ${i > index ? "cursor-not-allowed" : ""}`}
                aria-current={current ? "step" : undefined}
              >
                <span className="inline-flex size-4 items-center justify-center rounded-full border border-current text-[10px]">
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {s.title}
              </button>
              {i < steps.length - 1 && (
                <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>

      <div>
        <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
        {step.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
        )}
      </div>

      <div>{step.content}</div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Step {index + 1} of {steps.length}
          </span>
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <ChevronLeft className="size-4" /> Back
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isLast ? submitLabel : "Continue"}
            {!isLast && <ChevronRight className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReviewList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </dt>
          <dd className="mt-0.5 text-sm text-foreground">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
