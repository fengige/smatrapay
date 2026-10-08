import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { getServiceProvider, updateServiceProvider } from "@/lib/service-providers.functions";
import { editServiceProviderSchema } from "@/lib/service-provider-schema";
import {
  emptyProvider,
  issuesToErrors,
  ProviderForm,
  type ProviderFormValues,
} from "@/components/service-providers/ProviderForm";

export const Route = createFileRoute("/_authenticated/service-providers/$id/edit")({
  head: () => ({
    meta: [
      { title: "Edit Service Provider · SmatraPay" },
      {
        name: "description",
        content: "Update a service provider's personal, address and account details.",
      },
      { property: "og:title", content: "Edit Service Provider · SmatraPay" },
      { property: "og:description", content: "Update a service provider's details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditProviderPage,
});

function EditProviderPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchOne = useServerFn(getServiceProvider);
  const update = useServerFn(updateServiceProvider);
  const { data, isLoading, error } = useQuery({
    queryKey: ["service-provider", id],
    queryFn: () => fetchOne({ data: { id } }),
  });
  const [values, setValues] = useState<ProviderFormValues>(emptyProvider);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    const u = data.user as any;
    const p = (data.profile ?? {}) as any;
    const parts = String(u.name ?? "").split(" ");
    setValues({
      ...emptyProvider,
      first_name: p.first_name ?? parts[0] ?? "",
      middle_name: p.middle_name ?? "",
      last_name: p.last_name ?? parts.slice(1).join(" "),
      business_name: p.business_name ?? "",
      email: u.email ?? "",
      phone: u.phone ?? "",
      username: u.username ?? "",
      address: u.address ?? "",
      country: p.country ?? "",
      county: p.county ?? "",
      city: p.city ?? "",
      postal_address: p.postal_address ?? "",
      bio: u.bio ?? "",
      notes: u.notes ?? "",
      services: [],
    });
  }, [data]);

  const mutation = useMutation({
    mutationFn: (v: ProviderFormValues) => {
      const { password: _p, services: _s, ...rest } = v;
      return update({ data: { id, ...rest } });
    },
    onSuccess: async () => {
      toast.success("Service provider updated");
      await qc.invalidateQueries({ queryKey: ["service-provider", id] });
      await qc.invalidateQueries({ queryKey: ["service-providers"] });
      navigate({ to: "/service-providers/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save changes"),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { password: _p, services: _s, ...rest } = values;
    const parsed = editServiceProviderSchema.safeParse({ id, ...rest });
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
      description="Edit service provider"
    >
      {error ? (
        <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
      ) : isLoading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Link
                to="/service-providers/$id"
                params={{ id }}
                aria-label="Back to details"
                className="mt-1 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent/10"
              >
                <ArrowLeft className="size-4" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Edit Service Provider
                </h1>
                <p className="text-sm text-muted-foreground">{(data?.user as any)?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/service-providers/$id"
                params={{ id }}
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
                {mutation.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
          <ProviderForm mode="edit" values={values} errors={errors} onChange={setValues} />
        </form>
      )}
    </PortalLayout>
  );
}
