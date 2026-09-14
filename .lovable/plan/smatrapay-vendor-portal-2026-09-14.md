# SmatraPay Vendor Portal

A role-scoped version of the admin portal for users with the Vendor role. Same sidebar, header, cards, tables and dialogs — but a vendor only ever sees meters registered to their own account, the zones those meters sit in, and the residents living in those zones. All filtering happens on the server; changing a URL or calling the backend directly cannot widen what a vendor sees.

## Scope decisions (from your answers)

- A vendor's zones are derived from their meters: zone of the property that holds the unit each of their meters is attached to.
- Installation tracking is added to meters.
- A real notification system is built.

## Database changes

1. **Meters — installation tracking**: installation status (Not installed, Scheduled, Installed, Failed, Replaced), installation date, installer, location, notes. Defaults to "Not installed" for existing meters. Changes flow into the existing meter history trigger.
2. **Notifications table**: recipient, type, title, message, related record, read/unread, created time. Each person can read and mark read only their own. Created server-side when a vendor's meters, zones, residents or assignments change.
3. **Vendor audit log table**: actor, vendor, action (VENDOR_LOGIN, VENDOR_METER_CREATED, VENDOR_METER_ASSIGNED, etc.), resource, metadata, server timestamp. Insert-only — nobody can edit or delete entries.
4. **Vendor access rules**: security-definer helpers resolve, for a signed-in vendor, their meter set, the units those meters occupy, and the zones/properties behind them. New read/write rules let vendors reach exactly that slice of meters, units, properties, zones, routes, streets, resident profiles and assignments — and nothing else. Admin rules stay unchanged.

## Backend (vendor-scoped server functions)

New `src/lib/vendor.functions.ts`, every function verifying the Vendor role and deriving the vendor id from the session (never from the request body):

- Dashboard totals: zones, meters, active/inactive, residents, active residents, installed/not installed; assigned-zone table, recent meter activity, recent residents.
- Zones: list with resident/meter counts; zone detail with Information, Residents, Meters tabs.
- Meters: list with search, type/zone/resident/status/installation filters and pagination; add single meter (vendor locked to the session); bulk add reusing the existing all-or-nothing batch routine with vendor forced server-side; meter detail with Info/Resident/Zone/Activity tabs; activate/deactivate; update installation details.
- Residents: list and detail (profile, property/unit, meter, payments pulled from existing payment records).
- Assignments: list; assign a meter to a resident; change resident with confirmation and a recorded history entry (previous/new resident and zone, vendor, who, when, reason); unassign.
- Reports: meter, resident, zone and installation reports with date/zone/type/status filters plus CSV export.
- Notifications: list, unread count, mark read/all read.
- Profile: read and update permitted fields; profile photo upload/change/remove through the existing image mechanism.

Every list validates that the requested meter/zone/resident belongs to the vendor before returning or writing; mismatches return "Not found" rather than data.

## Frontend

New routes under `/vendor/*`, all inside the existing signed-in layout, each rendering the shared portal shell with the vendor's roles:

`/vendor/dashboard` (rebuilt), `/vendor/zones`, `/vendor/zones/$zoneId`, `/vendor/meters`, `/vendor/meters/$meterId`, `/vendor/meters/bulk-add`, `/vendor/residents`, `/vendor/residents/$id`, `/vendor/assignments`, `/vendor/reports`, `/vendor/notifications`, `/vendor/profile`.

Sidebar gains a vendor group: Dashboard, Zone Management, Meter Management, Resident Management, Meter Assignments, Reports, Notifications, and at the bottom My Profile and Sign out. The top bar's bell shows the vendor's unread count and links to Notifications; the avatar gets a dropdown with My Profile and Sign out.

Loading, empty ("No zones have been assigned to your vendor account yet.", etc.), validation, permission-denied and not-found states throughout; no demo rows anywhere.

## Admin side

Meter management and meter detail pages gain the installation status column and editing, so admins and vendors work off the same field.

## Technical notes

- Vendor scope is derived in Postgres security-definer helpers, so both the API rules and the server functions share one definition of "this vendor's data".
- Bulk add reuses the existing `bulk_add_meters` transaction routine with a vendor guard, preserving all-or-nothing behaviour and per-row error reporting.
- Meter-to-resident assignment continues to use the existing meter/unit/unit_assignment relationships — no parallel assignment tables.
- Audit and notification writes happen in the same server function as the change they describe.
