import { createFileRoute } from "@tanstack/react-router";
import { SettingsCardForm } from "@/components/configurations/SettingsCardForm";

export const Route = createFileRoute("/_authenticated/configurations/app-settings")({
  head: () => ({
    meta: [
      { title: "App Settings · Configurations · SmatraPay" },
      {
        name: "description",
        content: "Configure SmatraPay application name, support contacts and footer legal links.",
      },
      { property: "og:title", content: "App Settings · Configurations · SmatraPay" },
      {
        property: "og:description",
        content: "Application-level settings for the SmatraPay admin portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppSettingsTab,
});

function AppSettingsTab() {
  return (
    <SettingsCardForm
      group="app"
      sections={[
        {
          title: "Application",
          description: "Basic identity and support details shown across the portal.",
          fields: [
            { key: "app_name", label: "Application name", placeholder: "SmatraPay" },
            { key: "app_support_email", label: "Support email", type: "email" },
            { key: "app_support_phone", label: "Support phone" },
          ],
        },
        {
          title: "Footer",
          description: "Copyright text and legal links displayed at the bottom of every page.",
          fields: [
            {
              key: "footer_copyright",
              label: "Footer copyright text",
              hint: "The current year is added automatically.",
              type: "textarea",
            },
            { key: "footer_terms_url", label: "Terms of Service link" },
            { key: "footer_privacy_url", label: "Privacy Policy link" },
          ],
        },
      ]}
    />
  );
}
