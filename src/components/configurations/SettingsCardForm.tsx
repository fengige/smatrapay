import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import {
  getConfiguration,
  saveConfiguration,
  type SettingGroup,
} from "@/lib/configurations.functions";

export type SettingField = {
  key: string;
  label: string;
  type?: "text" | "password" | "email" | "number" | "select" | "switch" | "textarea";
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
};

export type SettingSection = {
  title: string;
  description?: string;
  fields: SettingField[];
};

export function SettingsCardForm({
  group,
  sections,
}: {
  group: SettingGroup;
  sections: SettingSection[];
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getConfiguration);
  const persist = useServerFn(saveConfiguration);

  const queryKey = ["configuration", group];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => load({ data: { group } } as never),
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const loaded = data?.values;

  useEffect(() => {
    if (loaded) setValues(loaded);
  }, [loaded]);

  const keys = useMemo(
    () => sections.flatMap((s) => s.fields.map((f) => f.key)),
    [sections],
  );

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, string> = {};
      for (const key of keys) payload[key] = values[key] ?? "";
      return persist({ data: { group, values: payload } } as never);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["app-settings", "footer"] });
      toast.success("Configuration saved");
    },
    onError: (e: Error) => toast.error(e.message || "Could not save configuration"),
  });

  function set(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      aria-busy={mutation.isPending}
      className="space-y-4"
    >
      {sections.map((section) => (
        <section key={section.title} className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
          {section.description && (
            <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => {
              const id = `setting-${field.key}`;
              const value = values[field.key] ?? "";
              const isWide = field.type === "textarea";
              return (
                <div key={field.key} className={`space-y-1.5 ${isWide ? "sm:col-span-2" : ""}`}>
                  <label htmlFor={id} className="text-sm font-medium text-foreground">
                    {field.label}
                  </label>

                  {field.type === "switch" ? (
                    <button
                      id={id}
                      type="button"
                      role="switch"
                      aria-checked={value === "true"}
                      onClick={() => set(field.key, value === "true" ? "false" : "true")}
                      className={`flex h-11 w-full items-center justify-between rounded-xl border border-border px-3 text-sm ${
                        value === "true" ? "bg-primary/10 text-foreground" : "bg-background"
                      }`}
                    >
                      <span>{value === "true" ? "Enabled" : "Disabled"}</span>
                      <span
                        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                          value === "true" ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 size-4 rounded-full bg-background transition-all ${
                            value === "true" ? "left-4" : "left-0.5"
                          }`}
                        />
                      </span>
                    </button>
                  ) : field.type === "select" ? (
                    <select
                      id={id}
                      value={value}
                      onChange={(e) => set(field.key, e.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    >
                      {(field.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      id={id}
                      value={value}
                      placeholder={field.placeholder ?? ""}
                      onChange={(e) => set(field.key, e.target.value)}
                      rows={3}
                      maxLength={1000}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    />
                  ) : (
                    <input
                      id={id}
                      type={field.type === "password" ? "password" : field.type ?? "text"}
                      autoComplete={field.type === "password" ? "new-password" : "off"}
                      value={value}
                      placeholder={field.placeholder ?? ""}
                      onChange={(e) => set(field.key, e.target.value)}
                      maxLength={1000}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  )}

                  {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {mutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
