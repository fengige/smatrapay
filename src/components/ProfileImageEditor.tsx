import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { extensionForType, validateProfileImage } from "@/lib/image-upload";
import { updateAgent } from "@/lib/agents.functions";
import { updateVendor } from "@/lib/vendors.functions";
import { updateLandlord } from "@/lib/landlords.functions";

type Kind = "agent" | "vendor" | "landlord";

/** Avatar with inline upload/remove controls for agent, vendor and landlord profiles. */
export function ProfileImageEditor({
  kind,
  userId,
  imageUrl,
  name,
  initials,
}: {
  kind: Kind;
  userId: string;
  imageUrl: string | null;
  name: string | null;
  initials: string;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useServerFn(
    kind === "agent"
      ? updateAgent
      : kind === "vendor"
        ? (updateVendor as never)
        : (updateLandlord as never),
  );

  const persist = async (value: string | null) => {
    await (save as unknown as (o: { data: unknown }) => Promise<unknown>)({
      data: { id: userId, profile_image: value },
    });
    await queryClient.invalidateQueries({ queryKey: ["user", userId] });
    await queryClient.invalidateQueries({ queryKey: ["users", kind] });
    await queryClient.invalidateQueries({ queryKey: ["profile-image-audit", userId] });
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const check = await validateProfileImage(file);
    if (!check.ok) {
      setError(check.error);
      toast.error(check.error);
      return;
    }
    setBusy("upload");
    try {
      const path = `${userId}/${Date.now()}.${extensionForType(file.type)}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: signed, error: signError } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signError || !signed?.signedUrl) throw signError ?? new Error("Could not link image");
      await persist(signed.signedUrl);
      toast.success("Profile image updated");
    } catch (e) {
      const message = (e as Error).message || "Could not upload image. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    setBusy("remove");
    setError(null);
    try {
      await persist(null);
      toast.success("Profile image removed");
    } catch (e) {
      const message = (e as Error).message || "Could not remove image";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name ? `${name} profile photo` : `${kind} profile photo`}
            className="size-24 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
            {initials}
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          aria-label={imageUrl ? "Change profile image" : "Upload profile image"}
          className="absolute -bottom-1 -right-1 inline-flex size-8 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-accent/10 disabled:opacity-60"
        >
          {busy === "upload" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
        >
          {imageUrl ? "Change photo" : "Upload photo"}
        </button>
        {imageUrl && (
          <button
            type="button"
            onClick={() => void onRemove()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline disabled:opacity-60"
          >
            {busy === "remove" ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
            Remove
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-center text-xs text-destructive">{error}</p>}
      <p className="mt-1 text-center text-[11px] text-muted-foreground">JPG, PNG or WebP · max 5MB</p>
    </div>
  );
}
