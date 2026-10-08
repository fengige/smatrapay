<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Store vending-software-level API configuration in `vending_software_api_settings`, separate from supplier settings, so each platform has one independently secured configuration.
- Cron and retry-job bearer tokens live in the locked-down `cron_settings` table, never in `app_settings` (app_settings has a public anon SELECT policy, so anything stored there is world-readable).
- Bank payment notifications (NCBA, Sidian) share the `bank_notifications` table, tagged by `bank` with unique (bank, trans_id), and the shared `vendNcbaNotification` vend/retry/SMS flow — so every bank gets idempotency, the retry queue and the admin screen without duplicating logic.
- Per-owner Sidian Bank credentials live in `payment_account_sidian_settings` (one row per payment_method_accounts row, service-role only, password never returned); the Sidian webhook authenticates against the meter owner's active settings, then shortcode matches, then global secrets — so each vendor's credentials stay isolated.
- Admin dashboard totals use authenticated, admin-checked queries with exact counts or complete pagination, and vendor summaries filter by role before limiting recent records, to avoid placeholder or truncated metrics.
- Transaction Records reads the security-invoker `transaction_records` view (meter_tokens ∪ token-less bank_notifications, owner resolved landlord → agent → vendor) — one source for all channels without duplicating transaction data, with RLS still applied.
- Service providers are users with the service_provider role plus a `service_provider_profiles` row (name parts, address, logo, soft-delete `deleted_at`) and one-to-many `service_provider_services`; jobs link via `installation_team_members.user_id` → `service_requests.technician_id` — reuses existing auth and job records without duplicating them.
