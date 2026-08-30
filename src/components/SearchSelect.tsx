import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

export type SearchSelectOption = {
  id: string;
  label: string;
  hint?: string | undefined;
};

type Props = {
  id?: string;
  value: string;
  options: SearchSelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (id: string) => void;
};

/** Accessible combobox with typeahead filtering for long option lists. */
export function SearchSelect({
  id,
  value,
  options,
  placeholder = "Select an option",
  emptyLabel = "No matches found",
  disabled,
  invalid,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || (o.hint ? o.hint.toLowerCase().includes(q) : false),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const choose = (optId: string) => {
    onChange(optId);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-background px-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
          invalid ? "border-destructive" : "border-border"
        }`}
      >
        <span className={selected ? "truncate" : "truncate text-muted-foreground"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, filtered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const opt = filtered[active];
                  if (opt) choose(opt.id);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder="Type to search…"
              aria-label="Search options"
              className="h-10 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</li>
            )}
            {filtered.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    i === active ? "bg-accent/15" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && (
                      <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>
                    )}
                  </span>
                  {o.id === value && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
