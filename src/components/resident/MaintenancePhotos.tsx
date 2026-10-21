import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { extensionForType, validateProfileImage } from "@/lib/image-upload";

export function MaintenancePhotos({ paths, onChange, onBusy }: { paths: string[]; onChange: (paths: string[]) => void; onBusy: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  async function pick(files: FileList | null) {
    if (!files?.length) return;
    if (paths.length + files.length > 5) { toast.error("You can attach up to 5 photos."); return; }
    setBusy(true); onBusy(true);
    const next = [...paths];
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Please sign in again.");
      const batch = crypto.randomUUID();
      for (const file of Array.from(files)) {
        const check = await validateProfileImage(file);
        if (!check.ok) throw new Error(check.error);
        const path = `${data.user.id}/resident-requests/${batch}/${crypto.randomUUID()}.${extensionForType(file.type)}`;
        const { error } = await supabase.storage.from("meter-evidence").upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw new Error("Could not upload the photo. Please try again.");
        next.push(path);
        const reader = new FileReader();
        reader.onload = () => setPreviews((old) => ({ ...old, [path]: String(reader.result) }));
        reader.readAsDataURL(file);
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { onChange(next); setBusy(false); onBusy(false); if (input.current) input.current.value = ""; }
  }
  return <div className="space-y-2">
    <span className="text-sm">Photos (optional)</span>
    <div className="flex flex-wrap gap-2">{paths.map((path, index) => <div key={path} className="relative size-20 overflow-hidden rounded-md border border-border">
      {previews[path] && <img src={previews[path]} alt={`Attachment ${index + 1}`} className="size-full object-cover" />}
      <Button type="button" size="icon" variant="secondary" className="absolute right-0 top-0 size-6" disabled={busy} aria-label={`Remove photo ${index + 1}`} onClick={async () => {
        const { error } = await supabase.storage.from("meter-evidence").remove([path]);
        if (error) { toast.error("Could not remove the photo."); return; }
        onChange(paths.filter((p) => p !== path));
      }}><Trash2 /></Button>
    </div>)}</div>
    <Button type="button" variant="outline" size="sm" disabled={busy || paths.length >= 5} onClick={() => input.current?.click()}>
      {busy ? <Loader2 className="animate-spin" /> : <Camera />} {busy ? "Uploading…" : "Add photos"}
    </Button>
    <p className="text-xs text-muted-foreground">Up to 5 JPG, PNG or WebP photos · 5MB each</p>
    <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void pick(e.target.files)} />
  </div>;
}