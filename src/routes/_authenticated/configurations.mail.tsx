import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";

import { SettingsCardForm } from "@/components/configurations/SettingsCardForm";
import { sendMailTest } from "@/lib/configurations.functions";

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
  const test = useServerFn(sendMailTest);
  const mutation = useMutation({
    mutationFn: () => test({} as never),
    onSuccess: (result: any) => {
      if (result?.sent) {
        toast.success(`Test email sent to ${result.email}`);
      } else if (result?.reason === "recipient_suppressed") {
        toast.warning(
          `Test email to ${result.email} was not sent — this address previously bounced or unsubscribed.`,
        );
      } else {
        toast.error("Test email was not sent");
      }
    },
    onError: (e: Error) => toast.error(e.message || "Test email could not be sent"),
  });

  return (
    <div className="space-y-4">
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
