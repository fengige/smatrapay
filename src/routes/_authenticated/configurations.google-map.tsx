import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin } from "lucide-react";
import { useState } from "react";

import { SettingsCardForm } from "@/components/configurations/SettingsCardForm";
import { getConfiguration } from "@/lib/configurations.functions";

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

function MapPreview() {
  const load = useServerFn(getConfiguration);
  const { data, isLoading } = useQuery({
    queryKey: ["configuration", "map"],
    queryFn: () => load({ data: { group: "map" } } as never),
  });
  const [failed, setFailed] = useState(false);

  const values = data?.values ?? {};
  const apiKey = values["google_maps_api_key"] ?? "";
  const enabled = values["google_maps_enabled"] === "true";
  const center = values["google_maps_default_center"] || "-1.286389,36.817223";

  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(
    center,
  )}&zoom=14&size=900x360&scale=2&markers=color:red%7C${encodeURIComponent(center)}&key=${encodeURIComponent(
    apiKey,
  )}`;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
          <MapPin className="size-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Map preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Renders a map centred on your saved default centre using the saved API key, so
            you can confirm the key works.
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-muted/30">
        {isLoading ? (
          <div className="h-64 animate-pulse bg-muted" />
        ) : !enabled ? (
          <p className="p-6 text-sm text-muted-foreground">
            Google Maps is disabled. Enable it above and save to see the preview.
          </p>
        ) : !apiKey ? (
          <p className="p-6 text-sm text-muted-foreground">
            No API key saved yet. Add your Google Maps API key above and save.
          </p>
        ) : failed ? (
          <p className="p-6 text-sm text-destructive">
            The map could not be loaded with the saved key. Check that the key is valid and
            that the Maps Static API is enabled for it in Google Cloud.
          </p>
        ) : (
          <img
            src={src}
            alt={`Map preview centred on ${center}`}
            className="h-64 w-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </section>
  );
}

function GoogleMapTab() {
  return (
    <div className="space-y-4">
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
      <MapPreview />
    </div>
  );
}
