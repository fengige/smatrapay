import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FOOTER_DEFAULTS, type FooterSettings } from "@/lib/settings.functions";

export const footerSettingsQuery = {
  queryKey: ["app-settings", "footer"],
  queryFn: async (): Promise<FooterSettings> => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", Object.keys(FOOTER_DEFAULTS));
    if (error) throw new Error(error.message);
    const map = new Map((data ?? []).map((r) => [r.key, r.value]));
    return {
      footer_copyright: map.get("footer_copyright") || FOOTER_DEFAULTS.footer_copyright,
      footer_terms_url: map.get("footer_terms_url") || FOOTER_DEFAULTS.footer_terms_url,
      footer_privacy_url: map.get("footer_privacy_url") || FOOTER_DEFAULTS.footer_privacy_url,
    };
  },
  staleTime: 5 * 60 * 1000,
};

export function useFooterSettings() {
  const { data } = useQuery(footerSettingsQuery);
  return data ?? FOOTER_DEFAULTS;
}
