import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Save, X } from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { createServiceProvider } from "@/lib/service-providers.functions";
import { createServiceProviderSchema } from "@/lib/service-provider-schema";
import {
  emptyProvider,
  issuesToErrors,
  ProviderForm,
  type ProviderFormValues,
} from "@/components/service-providers/ProviderForm";

export const Route = createFileRoute("/_authenticated/service-providers/new")({
  head: () => ({
    meta: [
      { title: "Add Service Provider · SmatraPay" },
      {
        name: "description",
        content:
          "Create a service provider account with login, contact details and services offered.",
      },
      { property: "og:title", content: "Add Service Provider · SmatraPay" },
      {
        property: "og:description",
        content: "Onboard a new service provider and the services they offer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewServiceProviderPage,
});

function NewServiceProviderPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createServiceProvider);
  const [values, setValues] = useState<ProviderFormValues>(emptyProvider);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (data: ProviderFormValues) => create({ data }),
    onSuccess: async (res) => {
      toast.success("Service provider created");
      await qc.invalidateQueries({ queryKey: ["service-providers"] });
      navigate({ to: "/service-providers/$id", params: { id: res.id } });
    },
    onError: (e: Error) => {
      if (/already been registered|already exists|duplicate/i.test(e.message)) {
        setErrors((p) => ({ ...p, email: "This email is already registered" }));
      }
      toast.error(e.message || "Could not create service provider");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = createServiceProviderSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    mutation.mutate(values);
  };

  return (
    <PortalLayout
      roles={["admin"]}
      title="Service Provider Management"
      description="Add a new service provider"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link
              to="/service-providers"
              search={{ page: 1, limit: 10 }}
              aria-label="Back to service providers"
              className="mt-1 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent/10"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Add Service Provider
              </h1>
              <p className="text-sm text-muted-foreground">
                Create their login and list the services they offer
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/service-providers"
              search={{ page: 1, limit: 10 }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
            >
              <X className="size-4" /> Cancel
            </Link>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <Save className="size-4" />
              {mutation.isPending ? "Saving…" : "Create Service Provider"}
            </button>
          </div>
        </div>
        <ProviderForm mode="create" values={values} errors={errors} onChange={setValues} />
      </form>
    </PortalLayout>
  );
}
