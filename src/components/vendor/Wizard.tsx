import { useState, type ComponentType, type ReactNode } from "react";
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
  /** Optional icon shown in the timeline stepper. */
  icon?: ComponentType<{ className?: string }>;
};

export function Wizard({
  steps,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  layout = "chips",
}: {
  steps: WizardStep[];
  submitLabel: string;
  pending?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  /** "timeline" renders the wide admin-style progress header. */
  layout?: "chips" | "timeline";
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
      {layout === "timeline" ? (
        <ol className="relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-start sm:gap-0">
          <span
            aria-hidden
            className="absolute left-12 right-12 top-11 hidden h-0.5 rounded bg-border sm:block"
          />
          <span
            aria-hidden
            className="absolute left-12 top-11 hidden h-0.5 rounded bg-primary transition-all duration-500 sm:block"
            style={{ width: `calc((100% - 6rem) * ${index / Math.max(1, steps.length - 1)})` }}
          />
          {steps.map((s, i) => {
            const Icon = s.icon;
            const active = i === index;
            const done = i < index;
            return (
              <li key={s.title} className="relative z-10 flex flex-1">
                <button
                  type="button"
                  onClick={() => i < index && setIndex(i)}
                  disabled={i > index}
                  aria-current={active ? "step" : undefined}
                  className="group flex flex-1 items-center gap-3 text-left sm:flex-col sm:items-center sm:gap-2 sm:text-center"
                >
                  <span
                    className={
                      active
                        ? "flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-primary/15 transition-all duration-300"
                        : done
                          ? "flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-4 ring-card transition-all duration-300"
                          : "flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground ring-4 ring-card transition-all duration-300"
                    }
                  >
                    {done ? (
                      <Check className="size-5" />
                    ) : Icon ? (
                      <Icon className="size-5" />
                    ) : (
                      <span className="text-sm font-bold">{i + 1}</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={
                        active
                          ? "block text-[11px] font-bold uppercase tracking-widest text-primary"
                          : "block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                      }
                    >
                      Step {i + 1}
                    </span>
                    <span
                      className={
                        active
                          ? "block truncate text-sm font-bold text-foreground"
                          : done
                            ? "block truncate text-sm font-semibold text-foreground/80"
                            : "block truncate text-sm font-medium text-muted-foreground"
                      }
                    >
                      {s.title}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
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
      )}

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
