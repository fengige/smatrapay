import { createFileRoute } from "@tanstack/react-router";
import { SettingsCardForm } from "@/components/configurations/SettingsCardForm";

export const Route = createFileRoute("/_authenticated/configurations/mail")({
  head: () => ({
    meta: [
      { title: "Mail Configuration · SmatraPay" },
      {
        name: "description",
        content: "Configure the SMTP mail driver, credentials and sender identity for SmatraPay.",
      },
      { property: "og:title", content: "Mail Configuration · SmatraPay" },
      {
        property: "og:description",
        content: "SMTP host, port, encryption and sender settings for outgoing email.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MailTab,
});

function MailTab() {
  return (
    <SettingsCardForm
      group="mail"
      sections={[
        {
          title: "Mail transport",
          description: "Outgoing mail server used for transactional email.",
          fields: [
            {
              key: "mail_enabled",
              label: "Outgoing email",
              type: "switch",
            },
            {
              key: "mail_driver",
              label: "Mail driver",
              type: "select",
              options: [
                { value: "smtp", label: "SMTP" },
                { value: "sendmail", label: "Sendmail" },
                { value: "log", label: "Log (no delivery)" },
              ],
            },
            { key: "mail_host", label: "SMTP host", placeholder: "smtp.example.com" },
            { key: "mail_port", label: "SMTP port", type: "number", placeholder: "587" },
            {
              key: "mail_encryption",
              label: "Encryption",
              type: "select",
              options: [
                { value: "tls", label: "TLS" },
                { value: "ssl", label: "SSL" },
                { value: "none", label: "None" },
              ],
            },
          ],
        },
        {
          title: "Credentials & sender",
          description: "Credentials are stored securely and only visible to administrators.",
          fields: [
            { key: "mail_username", label: "Username" },
            { key: "mail_password", label: "Password", type: "password" },
            { key: "mail_from_address", label: "From email", type: "email" },
            { key: "mail_from_name", label: "From name" },
          ],
        },
      ]}
    />
  );
}
