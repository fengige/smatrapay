# Roadmap

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
