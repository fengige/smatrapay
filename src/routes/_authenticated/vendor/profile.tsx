import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getVendorProfile, setVendorPhoto, updateVendorProfile } from "@/lib/vendor.functions";
import { supabase } from "@/integrations/supabase/client";
import { extensionForType, validateProfileImage } from "@/lib/image-upload";
import { ErrorBlock, LoadingBlock, StatusBadge, formatDate } from "@/components/vendor/VendorUI";

export const Route = createFileRoute("/_authenticated/vendor/profile")({
  head: () => ({
    meta: [
      { title: "My Profile · Vendor · SmatraPay" },
      {
        name: "description",
        content: "Update your vendor contact details and profile photo on SmatraPay.",
      },
      { property: "og:title", content: "My Profile · Vendor · SmatraPay" },
      {
        property: "og:description",
        content: "Keep your vendor account details current.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: VendorProfilePage,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{error.message}</p>,
});

function VendorProfilePage() {
  const access = Route.useLoaderData();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getVendorProfile);
  const saveProfile = useServerFn(updateVendorProfile);
  const savePhoto = useServerFn(setVendorPhoto);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor-profile"],
    queryFn: () => fetchProfile(),
  });

  const [form, setForm] = useState({ name: "", phone: "", username: "", bio: "" });
  useEffect(() => {
    if (data) {
      setForm({
        name: data.name ?? "",
        phone: data.phone ?? "",
        username: data.username ?? "",
        bio: data.bio ?? "",
      });
    }
  }, [data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vendor-profile"] });
  };

  const saveMutation = useMutation({
    mutationFn: () => saveProfile({ data: form }),
    onSuccess: async () => {
      await refresh();
      toast.success("Profile updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const photoMutation = useMutation({
    mutationFn: (url: string | null) => savePhoto({ data: { profile_image: url } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Profile photo updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(file: File) {
    setUploading(true);
    try {
      const check = await validateProfileImage(file);
      if (!check.ok) {
        toast.error(check.error);
        return;
      }
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error("Your session has expired. Please sign in again.");
      const path = `${userId}/${Date.now()}.${extensionForType(file.type)}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      const { data: signed, error: signError } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signError || !signed) throw new Error(signError?.message ?? "Could not read the uploaded photo");
      photoMutation.mutate(signed.signedUrl);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <DashboardShell access={access} title="My profile" description="Your vendor account details.">
      {error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4 pb-6">
          <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5">
            {data.profile_image ? (
              <img
                src={data.profile_image}
                alt={data.name ?? "Vendor"}
                className="size-20 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-20 items-center justify-center rounded-full bg-secondary text-xl font-bold">
                {(data.name ?? data.email ?? "V").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-foreground">{data.name ?? "Vendor"}</p>
              <p className="text-sm text-muted-foreground">{data.email ?? "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Member since {formatDate(data.created_at)}
              </p>
            </div>
            <StatusBadge value={data.status} />
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                  e.target.value = "";
                }}
              />
              <button
                className="btn-outline px-3 py-1.5 text-sm"
                disabled={uploading || photoMutation.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Uploading…" : data.profile_image ? "Change photo" : "Upload photo"}
              </button>
              {data.profile_image && (
                <button
                  className="btn-outline px-3 py-1.5 text-sm"
                  disabled={photoMutation.isPending}
                  onClick={() => photoMutation.mutate(null)}
                >
                  Remove
                </button>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-bold text-foreground">Contact details</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["name", "Vendor name"],
                  ["phone", "Phone"],
                  ["username", "Username"],
                  ["bio", "About"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-sm">
                  <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
                    {label}
                  </span>
                  <input
                    className="input"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
              <label className="text-sm">
                <span className="mb-1 block text-[0.65rem] font-bold uppercase text-muted-foreground">
                  Email
                </span>
                <input className="input" value={data.email ?? ""} readOnly disabled />
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="btn-primary px-4 py-2 text-sm"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
