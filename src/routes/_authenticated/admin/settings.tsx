import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PortalLayout } from "@/components/PortalLayout";
import { updateFooterSettings } from "@/lib/settings.functions";
import { footerSettingsQuery, useFooterSettings } from "@/lib/use-footer-settings";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "App settings · SmatraPay" },
      {
        name: "description",
        content: "Customize SmatraPay footer copyright text, Terms of Service and Privacy Policy links.",
      },
      { property: "og:title", content: "App settings · SmatraPay" },
      {
        property: "og:description",
        content: "Customize SmatraPay footer copyright text and legal links.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const current = useFooterSettings();
  const { isLoading } = useQuery(footerSettingsQuery);
  const save = useServerFn(updateFooterSettings);

  const [copyright, setCopyright] = useState(current.footer_copyright);
  const [terms, setTerms] = useState(current.footer_terms_url);
  const [privacy, setPrivacy] = useState(current.footer_privacy_url);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCopyright(current.footer_copyright);
    setTerms(current.footer_terms_url);
    setPrivacy(current.footer_privacy_url);
  }, [current.footer_copyright, current.footer_terms_url, current.footer_privacy_url]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await save({
        data: {
          footer_copyright: copyright,
          footer_terms_url: terms,
          footer_privacy_url: privacy,
        },
      });
      await queryClient.invalidateQueries({ queryKey: footerSettingsQuery.queryKey });
      toast.success("Footer settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  const year = new Date().getFullYear();

  return (
    <PortalLayout title="App settings" description="Customize the site footer shown across the portal.">
      <form
        onSubmit={onSubmit}
        aria-busy={saving || isLoading}
        className="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5"
      >
        <div className="space-y-1.5">
          <label htmlFor="footer-copyright" className="text-sm font-medium text-foreground">
            Footer copyright text
          </label>
          <input
            id="footer-copyright"
            value={copyright}
            onChange={(e) => setCopyright(e.target.value)}
            maxLength={200}
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-xs text-muted-foreground">
            The current year is added automatically. Preview: © {year} {copyright}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="footer-terms" className="text-sm font-medium text-foreground">
              Terms of Service link
            </label>
            <input
              id="footer-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="footer-privacy" className="text-sm font-medium text-foreground">
              Privacy Policy link
            </label>
            <input
              id="footer-privacy"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </PortalLayout>
  );
}
