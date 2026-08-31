import { createFileRoute } from "@tanstack/react-router";
import { SettingsCardForm } from "@/components/configurations/SettingsCardForm";

export const Route = createFileRoute("/_authenticated/configurations/social-media")({
  head: () => ({
    meta: [
      { title: "Social Media Login · SmatraPay" },
      {
        name: "description",
        content: "Enable and configure Google, Apple and Microsoft social login for SmatraPay.",
      },
      { property: "og:title", content: "Social Media Login · SmatraPay" },
      {
        property: "og:description",
        content: "Client IDs, secrets and redirect URLs for supported social login providers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SocialMediaTab,
});

function SocialMediaTab() {
  return (
    <SettingsCardForm
      group="social"
      sections={[
        {
          title: "Google Login",
          description: "Allow residents and staff to sign in with their Google account.",
          fields: [
            { key: "social_google_enabled", label: "Google login", type: "switch" },
            { key: "social_google_client_id", label: "Client ID" },
            { key: "social_google_client_secret", label: "Client secret", type: "password" },
            {
              key: "social_google_redirect_url",
              label: "Redirect / callback URL",
              placeholder: "https://apps.smatrapay.com/auth/callback",
            },
          ],
        },
        {
          title: "Apple Login",
          description: "Sign in with Apple for iOS residents.",
          fields: [
            { key: "social_apple_enabled", label: "Apple login", type: "switch" },
            { key: "social_apple_client_id", label: "Client ID" },
            { key: "social_apple_client_secret", label: "Client secret", type: "password" },
            { key: "social_apple_redirect_url", label: "Redirect / callback URL" },
          ],
        },
        {
          title: "Microsoft Login",
          description: "Sign in with a Microsoft work or personal account.",
          fields: [
            { key: "social_microsoft_enabled", label: "Microsoft login", type: "switch" },
            { key: "social_microsoft_client_id", label: "Client ID" },
            { key: "social_microsoft_client_secret", label: "Client secret", type: "password" },
            { key: "social_microsoft_redirect_url", label: "Redirect / callback URL" },
          ],
        },
      ]}
    />
  );
}
