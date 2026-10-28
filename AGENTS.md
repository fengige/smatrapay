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
- Jobs are existing `service_requests`; assigning a provider (`src/lib/jobs.functions.ts`) reuses/creates the provider's `installation_team_members` row in the vendor's "Service Providers" team, so all job views keep one relationship. Predefined services live in `service_catalog`; `service_provider_services.catalog_id` links each offered service to it by name.
- My Jobs customer SMS uses `job-status-sms.server.ts` only after an authorized compare-and-set status change; reuse owner SMS settings and `sms_messages` so credentials remain server-only and failed sends do not undo job progress.
- Customer Jobs reuses the shared jobs view at `/resident/jobs`; server reads require the resident role and the session's `resident_id`, and expose only assignment/status history and provider notes to avoid leaking staff-only events.
- Resident scope uses active unit_assignments → units → meters; resident_token_purchases vend only after confirmed M-Pesa callbacks, keyed resident:<purchase id>, preventing foreign reads and duplicate vending.
- Resident maintenance photos reuse `service_request_events.storage_path` in the private `meter-evidence` bucket under the resident's isolated folder; request/event/photo creation is atomic and photo reads require server-checked job ownership before short-lived URLs are signed.
- Resident Feedback & Enquiries uses existing feedback/enquiry records with admin-checked functions and RLS; staff replies reuse `staff_response`, so no duplicate messaging or role model is introduced.
- Resident password login/recovery privately resolves existing `users.username` or `users.email`, verifies email aliases match the linked Auth email, authenticates with an isolated nonpersistent provider client and checks active resident access; never expose an anonymous lookup endpoint or rewrite existing usernames to enable email sign-in.
- Resident usernames share the existing nullable username column with a case-insensitive trimmed unique index; account creation/updates normalize resident names and staff manage them through existing scoped workflows, so existing identities are not duplicated.
- Resident login/recovery abuse counters persist as hashed account/IP keys in service-only `resident_auth_limits`; password setup/recovery use the managed auth sender and verified recovery flow, never stored or emailed permanent passwords.
- Password recovery UI requires the SDK recovery event bound to the session user; password writes additionally verify signed OTP/recovery authentication claims server-side, so a forged URL on a normal password/OAuth session cannot authorize a reset.
- Resident Account tabs allow only admins/current scoped vendors to update resident-only Auth passwords, with password-free audits and security notifications, preventing account takeover.
- Resident photos reuse users.profile_image/private avatars and shared fallback avatars with ten-minute signed reads; portal menus share the resident-profile query for refresh, never render raw storage paths. Preserve raw paths for edits and delete superseded own photos.
- Resident-only identities require provider-verified TOTP assurance across RPCs and sign-in methods; bearer-bound enrollment/verification never changes staff authentication.
- Resident mobile chrome and feature hubs reuse protected resident routes and existing server services; responsive styling is scoped to the resident shell so staff portals retain their layout.
- PWA registration has one guarded browser module; generateSW stores only public offline fallback/icons and hashed static assets, never personal HTML or API responses, so offline access cannot disclose account data.
- Resident notification destinations are allowlisted resident routes; purchase identifiers remain in validated route search state so refresh checks the existing payment instead of initiating another one.
- Pay-as-you-go products live in `payg_products` (vendor-owned via RLS, images in private `payg-products` bucket under the vendor folder); residents read active products only from vendors owning meters in their assigned units, via server functions — keeps catalogues vendor-isolated.
- Pay-as-you-go purchases snapshot plans in `payg_plans`; service-only `payg_payment_attempts` serialize charges and derive progress from confirmed attempts, with vendor/platform M-Pesa configuration shared via `mpesaConfigFor`. A capability-bound callback plus Daraja STK Query verifies payments without token vending; uncertain attempts block new charges to prevent duplicates.
- Resident dashboard/catalogue and support chat reuse the resident-bound `readResidentPaygPlans` helper; AI receives only allowlisted plan/progress fields so payment truth and isolation stay consistent without exposing payment credentials or raw errors.
- Zone SELECT policies check direct vendor ownership alongside relationship helpers so newly inserted rows are readable during INSERT RETURNING without weakening vendor isolation.
- Vendor-created landlord visibility uses a caller-bound private RLS helper joining protected roles and users.created_by; keep ordinary reads RLS-bound so unassigned landlords appear without cross-vendor access.
- Property create/update/import flows share property-errors.ts to translate uniqueness conflicts without disclosing database constraint names or other owners' records; preserve existing uniqueness rules.
