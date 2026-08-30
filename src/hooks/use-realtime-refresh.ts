import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to Postgres changes on the given tables and invalidates the
 * supplied query keys so lists refresh without a manual reload.
 */
export function useRealtimeRefresh(
  channelName: string,
  tables: string[],
  keys: QueryKey[],
  enabled = true,
) {
  const queryClient = useQueryClient();
  const tableKey = tables.join(",");
  const keysKey = JSON.stringify(keys);

  useEffect(() => {
    if (!enabled) return;
    const parsedKeys = JSON.parse(keysKey) as QueryKey[];
    let channel = supabase.channel(`${channelName}-${Math.random().toString(36).slice(2)}`);
    for (const table of tableKey.split(",").filter(Boolean)) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          for (const key of parsedKeys) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        },
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, tableKey, keysKey, enabled, queryClient]);
}
