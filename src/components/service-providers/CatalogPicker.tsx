import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listServiceCatalog } from "@/lib/jobs.functions";
import { inputClass } from "@/components/service-providers/ProviderUI";

/** Lets the admin pick a pre-defined service; fills name + description. */
export function CatalogPicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (s: { service_name: string; description: string }) => void;
}) {
  const fetchCatalog = useServerFn(listServiceCatalog);
  const { data } = useQuery({
    queryKey: ["service-catalog"],
    queryFn: () => fetchCatalog(),
    staleTime: 5 * 60_000,
  });
  const services = data?.services ?? [];
  const match = services.find((s) => s.name.toLowerCase() === value.trim().toLowerCase());
  return (
    <select
      className={inputClass}
      value={match?.id ?? ""}
      onChange={(e) => {
        const s = services.find((x) => x.id === e.target.value);
        if (s) onPick({ service_name: s.name, description: s.description });
      }}
    >
      <option value="">Choose from service catalog…</option>
      {services.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
