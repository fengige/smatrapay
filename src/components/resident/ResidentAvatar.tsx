import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const sizes = { table: "size-10", detail: "size-24", header: "size-24" };

/** The neutral fallback stays visible while loading and after image failures. */
export function ResidentAvatar({ photo, name, size = "table" }: {
  photo?: string | null;
  name?: string | null;
  size?: keyof typeof sizes;
}) {
  const label = `${name?.trim() || "Resident"} profile photo`;
  return <Avatar className={sizes[size]} role="img" aria-label={label}>
    {photo && <AvatarImage key={photo} src={photo} alt={label} className="object-cover" referrerPolicy="no-referrer" />}
    <AvatarFallback className="bg-primary/10 text-primary">
      <UserRound aria-hidden="true" className={cn(size === "table" ? "size-5" : "size-10")} />
    </AvatarFallback>
  </Avatar>;
}