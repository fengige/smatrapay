import { createFileRoute } from "@tanstack/react-router";
import { SettingsCardForm } from "@/components/configurations/SettingsCardForm";

export const Route = createFileRoute("/_authenticated/configurations/google-map")({
  head: () => ({
    meta: [
      { title: "Google Map API · SmatraPay" },
      {
        name: "description",
        content: "Manage the Google Maps API key and map features used across SmatraPay.",
      },
      { property: "og:title", content: "Google Map API · SmatraPay" },
      {
        property: "og:description",
        content: "Google Maps API key, enablement and default map centre configuration.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GoogleMapTab,
});

function GoogleMapTab() {
  return (
    <SettingsCardForm
      group="map"
      sections={[
        {
          title: "Google Maps",
          description: "Used for property address lookup and map previews.",
          fields: [
            { key: "google_maps_enabled", label: "Google Maps", type: "switch" },
            {
              key: "google_maps_api_key",
              label: "Google Map API key",
              type: "password",
              hint: "Stored securely; only administrators can read this value.",
            },
            {
              key: "google_maps_default_center",
              label: "Default map centre (lat,lng)",
              placeholder: "-1.286389,36.817223",
            },
          ],
        },
      ]}
    />
  );
}
