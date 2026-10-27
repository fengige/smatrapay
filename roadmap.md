# Roadmap

- [x] Added resident Pay-as-you-go Buy/review controls and dashboard/catalogue confirmed-progress views; snapshotted plans, serialized payment attempts, provider STK Query verification, scoped reads and dedicated capability-bound callback without token vending. 33 tests passed; preview build OK; authorized Kalyango phone/desktop catalogue and dashboard checks passed; forged callback rejected with 401.
- [ ] Live Pay-as-you-go charge/confirmation/progress and concurrent database-flow acceptance (blocked: no Kambasco/platform M-Pesa configuration or payment authorization; callback deployment not requested). Current HomePlus Max catalogue price shown as KES 21,750 conflicts with KES 2,800 + 480 × KES 65 = KES 34,000; payment validation rejects inconsistent terms until vendor resolves them.

- [x] Created the supplied HomePlus Max offering through Kambasco Technologies Ltd's vendor form; refresh and database read confirmed KES 2,800 down payment plus KES 65/day for 480 payments. Authorized Kalyango Mohammad session displayed the product, vendor attribution and plan in the resident catalogue; screenshots verified. Only one real product was supplied; no photo supplied.

- [x] Resident mobile follow-up: installation control in More, allowlisted notification links, offline request/receipt/profile/security controls and refresh-safe existing payment links; current services reused.
- [x] Follow-up regression: 68 tests passed; 360/768/1280px public sign-in/offline screenshots without overflow or page errors; resident/admin/vendor URLs deny signed-out access, manifest/icons load and preview registers no workers; build OK.

- [x] Resident mobile app: resident-only header, Home/Payments/Utilities/Requests/Account tabs, More, safe-area/touch layouts, stacked meter/payment/request lists and existing feature hubs; staff layouts retained.
- [x] Resident PWA: logo-based icons/manifest, guarded generated worker, non-sensitive offline fallback, connection-required purchase review and reconnection refresh; no personal HTML/API caching.
- [x] Resident regression checks: 84 tests passed; public sign-in tested at 360/768/1280px without overflow or page errors, protected mobile links redirect to sign-in, preview registers no workers; build OK.
- [ ] Resident authenticated mobile acceptance: home/tabs, purchase confirmation, request/photo creation, profile/password/2FA and sign-out (blocked: no account matches requester; authorized resident preview sign-in required). Rent/invoices/documents remain unavailable in existing workflows.
- [ ] Installed-app/offline acceptance on Android/iPhone (blocked: publication authorization and supported device/browser; no deployment performed).

- [x] Shared resident avatars: Profile Photo columns, authorized batched ten-minute photo reads, consistent detail/profile fallbacks and refresh; upload rules unchanged; 45 tests and preview avatar states passed, build OK.
- [ ] Shared avatar signed-in acceptance across admin/vendor/resident pages and upload/removal persistence (blocked: no account matches the requesting user for preview sign-in).

- [x] Resident profile implementation: Personal Info, Account, Audit Logs; private own-photo preview/upload/removal, permitted existing resident fields, provider password verification, TOTP enrollment/verified disabling and own paginated audits; 48 tests passed and build OK.
- [ ] Resident profile live acceptance: photo upload/edit/removal, personal save, real password change, TOTP enrollment/verification/disable and persistence/isolation checks (blocked: resident session access was declined; resident sign-in in preview is required). Provider TOTP availability remains unverified; no recovery codes or SMS second factors are offered.

- [x] Resident email-style sign-in: registered email or existing username with private matching; 44 tests passed; real email/password login, My Jobs (empty) and My Properties (assigned home/meter) verified.

- [x] Resident Account tabs at /residents/$id and /vendor/residents/$residentId: admin-only and current vendor-assignment-scoped Auth password updates, policy validation, audit and resident notification; 42 tests passed and build OK.
- [ ] Real Account password update and resident sign-in verification (blocked: no account matches the requesting user; sign in in the preview). Signed-out access denial and mocked server scope/provider outcomes verified.

- [x] Resident username/password sign-in: private account lookup, case-insensitive usernames, active resident checks, persistent abuse limits.
- [x] Resident username password recovery: generic responses, trusted redirects, SDK recovery event and server-verified recovery authentication before password change.
- [x] Resident authentication rules (25 tests), signed-out login/recovery and forged recovery URL rejection verified; latest build passed.
- [x] Successful resident password sign-in verified with the supplied resident account.
- [ ] Emailed recovery completion (requires access to the resident's recovery email).

- [x] My Jobs: customer SMS sending using existing owner SMS settings, failure history and safe status persistence; notification tests passed.
- [x] Customer Jobs: resident-only service requests, statuses and provider updates at /resident/jobs; isolation tests passed.
- [ ] Signed-in customer SMS and Customer Jobs verification (blocked: no session can be minted for the requesting user's account; sign-in required).

- [x] Rebuild Service Providers to match the Users page layout, filters, export controls and table.

- [x] Mail tab: send-test email button (managed mail pipeline)
- [x] Google Map tab: live map preview with configured key
- [x] Admin dashboard: currency conversion helper card

- [x] Transactional locking for meter assignment mutations
- [x] Pagination + sorting on agent/vendor/landlord assignment history
- [x] Edit profile image on agent, vendor and landlord detail pages
- [x] Server-side pagination on agent/vendor/landlord lists
- [x] Meter dashboard: assigned meters, status and usage trends per agent/vendor/landlord
- [x] Meter management create/edit/delete + live meter readings panel per holder
- [x] Token ledger page with per-holder transactions, units and readings
- [x] Meter unit type + price per unit surfaced; revenue per meter type on dashboard and ledger
- [ ] Payment methods: redesign to Digital/Offline tabs with logo upload shown beside each method
- [x] Payment History page grouped by landlord/agent/vendor with method and account
- [x] Vendor Portal (dashboard, zones, meters, residents, assignments, reports, notifications, profile) with server-side vendor scoping
- [x] Vendor Prepaid Meter Operations (activation, tokens & payments, readings, service requests, installation teams, prepaid dashboard cards, meter activation/reading tabs, resident prepaid account, extended reports)
- [x] Installation status shared across admin + vendor meter pages
- [x] Property details: owner-specific profile card and Landlord/Agent/Vendor links
- [x] Vendor POS + POS Shift Report (vendor-scoped counter sales, receipts, SMS re-send)

- [x] Vendor portal: mirror admin Property Management layout
- [x] Admin Token Management + Token Ledger: show vendor-issued tokens and overdraft limits
- [x] Vendor portal: mirror admin Meter Management page
- [ ] Vendor portal: Resident Management (add/edit/assign unit/activate/deactivate/archive, resident details with 5 tabs)
- [ ] Vendor portal: Landlord Management (add/edit/assign unit/activate/deactivate/archive, landlord details with 7 tabs)
- [ ] Vendor portal: Property Management (add/edit/activate/deactivate/archive, property details with Units, Address, Unit Timeline, Residents, Owner Details, My Photos tabs)

- [x] Vendor portal: standalone Add Landlord / Add Property / Add Resident wizard pages (/vendor/landlords/new, /vendor/properties/new, /vendor/residents/new), linked from the listing pages
- [ ] Vendor portal: AI tenant application chat (/vendor/residents/apply) that prefills the Add Resident wizard
- [x] Vendor portal: mirror admin meters/bulk-add on /vendor/meters/bulk-add
- [x] Vendor portal: /vendor/properties/new mirrors admin /properties/new wizard
- [x] Vendor portal: /vendor/residents/new mirrors admin /residents/new
- [x] Meters: Vending Software select in Add Meter modal, /meters/bulk-add, bulk-add dialog
- [x] /meters page: Vending Software column
- [x] Supplier API settings per vending software (CALIN/REZICOM/SUNKING) with default fallback
- [x] Meter details pages (admin + vendor) show Vending software

- [x] Vending Software admin module (list, details with Info/Meters/Usage/Activity tabs, CRUD, audit logging, sidebar entry)
- [x] Vending-software-driven token generation: meter → assigned vending software → supplier API settings → CALIN POS_Purchase / maintenance calls, idempotency keys, masked integration logs
- [x] Vending Software details: independent admin-only API Settings tab with secure per-software credentials and connection testing
- [x] Show Commission and VAT under Rate in meter search results on /pos and /token-management
- [x] Hide Commission & VAT on Commission section on Price Management
- [ ] Show Commission and VAT under Rate in meter search results on /vendor/pos and /vendor/token-management
- [ ] Dashboard: tokens generated per vending software and per meter, with breakdown of failed attempts
- [x] Retry queue: automatic scheduled retries every few minutes (done — pg_cron drain job every 5 min, verified 200)
- [x] /ncba-payments: display the NCBA Endpoint URL (done — verified with copy button)
- [ ] Live Sidian C2B test through token and SMS (blocked: Sidian username/password not saved)

- [x] Admin dashboard: replace placeholder metrics with current records and correct module links
- [x] Staff login: hide the Agent portal from the "Select Portal" list
- [x] Admin sidebar: hide the Agent Management menu entry
- [x] Service Providers module: list actions, Add page with services, details tabs, logo/photo, suspend/soft delete
- [x] Vendor Jobs page (/vendor/jobs): assign service requests to service providers
- [x] Admin Jobs page (/jobs): search, filter, assign; provider names link to Service Provider details
- [x] Service provider "My Jobs" page (/service-provider/jobs)
- [x] Shared service catalog; providers pick services from it
- [ ] Signed-in check as a service provider (blocked: no service provider account exists in the database yet)
- [x] My Jobs status updates (In Progress / Completed / Cancelled) with vendor + customer notifications
- [x] Jobs tab on resident details (/residents/$id and /vendor/residents/$residentId): resident-filtered job list, staff job timeline, vendor scope enforced server-side

- [x] Resident Portal: dashboard, properties & meters, M-Pesa token purchase (owner config → platform), transactions with safe retry, token statement, maintenance requests, notifications, profile, AI support + escalation, feedback, insurance/loan enquiries.
- [ ] Rent/service-charge invoices, rent statements, documents (deferred by user: "coming soon").
- [x] Private photo uploads on resident maintenance requests; authorized resident/admin/vendor job details show photos.
- [x] Admin Resident Feedback & Enquiries screen at /resident-inbox: search, type filter, pagination, message details and replies.
- [ ] Signed-in photo submission and staff reply verification (blocked: requesting user's account has no mintable session; sign-in required).
- [x] Signed-in resident verification: email/password login redirects to /resident/dashboard; /resident/jobs and /resident/meters load successfully.

- [x] Publish resident PWA for phone install testing
