import { Users } from "lucide-react";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export function ChatAvatar({ name, photo, online, group, size = "md" }: { name: string; photo?: string | null; online?: boolean; group?: boolean; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "size-8 text-[0.65rem]" : size === "lg" ? "size-14 text-base" : "size-10 text-xs";
  const src = photo && /^https?:\/\//.test(photo) ? photo : null;
  return (
    <span className={`relative inline-flex shrink-0 ${dim}`}>
      {src ? (
        <img src={src} alt="" className="size-full rounded-full object-cover" loading="lazy" />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-accent/80 font-bold text-primary-foreground">
          {group ? <Users className="size-1/2" /> : initials(name)}
        </span>
      )}
      {online !== undefined && !group && (
        <span
          aria-label={online ? "Online" : "Offline"}
          className={`absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-background ${online ? "bg-success" : "bg-muted-foreground/40"}`}
        />
      )}
    </span>
  );
}
