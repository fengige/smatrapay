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

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
              <MailCheck className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Send a test email</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sends a test message to your own admin email address so you can verify
                outgoing mail is working.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {mutation.isPending ? "Sending…" : "Send test email"}
          </button>
        </div>
      </section>
    </div>
  );
}
