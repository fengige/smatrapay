# Owner commission configuration and pricing-table synchronization

## Confirmed issue
The current Commission Configuration form writes one system-wide `pricing_settings` record. There is no owner-specific commission configuration in the database. The table currently displays “Not configured” in all three columns. Invalidating its existing meter query cannot retrieve owner settings that do not exist.

## Proposed change
- Add persisted commission configuration for each owner account, containing Who Pays Commission, Commission (%), and VAT on Commission (%).
- Add an explicit owner selection to the administrator configuration section. Keep existing system-wide settings separately identifiable and preserve their current behavior; never treat those settings as an owner's configuration.
- Load the selected owner's saved values into the form. An owner with no saved configuration starts with empty required fields.
- Map every pricing-table row using the meter's resolved actual owner account. Display that owner's saved rates with two decimal places and Owner/Resident; display “Not configured” when no configuration exists.
- Save only the selected owner's configuration. After persistence succeeds, refresh the owner configuration query and its change history. All matching rows update from the persisted result, including rows revealed by subsequent filtering.
- Reuse the existing periodic/focus refresh and realtime refresh mechanism where supported. External changes are retrieved on the next refresh.
- Preserve filters, selection, existing price actions, meter totals, validation, existing shared-settings audit history, and all other portals.

## Scope assumption
This task changes administrator configuration persistence and table readback only. It does **not** change how vending currently chooses commission rates or payer, nor change historical transactions. Owner-specific settings will not silently replace the current calculation source in this task.

## Technical details
- Use a unique owner-account key in a new public configuration table, with explicit grants, RLS, administrator-authorized reads/writes, percentage constraints, and atomic change-history recording.
- Reuse the authoritative owner resolution already returned by `listMeters`; do not map by the administrator session, vendor-management relationship, or display name.
- Use a dedicated owner-configuration query key, separate from shared settings and shared meter queries. Invalidate it only after a successful save; propagate refresh failures without pretending unsaved values were persisted.
- Do not seed owner configurations from global defaults or per-meter overrides.

## Verification
- Test two owners with different rates and opposite payer choices, multiple meters for one owner, and an unconfigured owner.
- Test successful save → persisted read → query refresh, failed saves, later filtering, and external changes retrieved on refresh.
- Run focused regression tests and check preview errors. Verify signed-in save/readback if an authorized administrator session is available; otherwise report that limitation.