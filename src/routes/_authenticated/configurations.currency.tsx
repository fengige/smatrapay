import { createFileRoute } from "@tanstack/react-router";
import { SettingsCardForm } from "@/components/configurations/SettingsCardForm";

export const Route = createFileRoute("/_authenticated/configurations/currency")({
  head: () => ({
    meta: [
      { title: "Currency SetUp · SmatraPay" },
      {
        name: "description",
        content: "Set the currency name, code, symbol and decimal places used across SmatraPay.",
      },
      { property: "og:title", content: "Currency SetUp · SmatraPay" },
      {
        property: "og:description",
        content: "Default currency configuration for billing, tokens and POS amounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CurrencyTab,
});

function CurrencyTab() {
  return (
    <SettingsCardForm
      group="currency"
      sections={[
        {
          title: "Currency",
          description: "Applied to token sales, prices and reports.",
          fields: [
            { key: "currency_name", label: "Currency name", placeholder: "Kenyan Shilling" },
            { key: "currency_code", label: "Currency code", placeholder: "KES" },
            { key: "currency_symbol", label: "Currency symbol", placeholder: "KSh" },
            {
              key: "currency_decimals",
              label: "Decimal places",
              type: "select",
              options: [
                { value: "0", label: "0" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
              ],
            },
            { key: "currency_status", label: "Status", type: "switch" },
            { key: "currency_is_default", label: "Default currency", type: "switch" },
          ],
        },
      ]}
    />
  );
}
