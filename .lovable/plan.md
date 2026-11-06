# Bulk meter assignment

- Add shared Export CSV Template and Import CSV actions to administrator and vendor Meter Assignments pages.
- Use exactly **Meter, Type, Resident, Unit, Property**. Match existing meter numbers/IDs, resident email/ID or unambiguous name, unit ID or number within the property, and property ID/code or unambiguous name; preserve leading zeros.
- Provide a property scope selector (all permitted properties or one property). Vendor scope always comes from the signed-in account.
- Preview every row with reference checks, duplicate/conflict warnings and errors. Require confirmation to save eligible rows; already matching assignments are skipped, and meters assigned elsewhere are rejected rather than moved silently.
- Show successful/skipped/failed totals and a downloadable row-error CSV. Retrying the same file must not create assignments again.

## Technical approach

- Reuse the existing meter-to-unit relationship, resident unit assignments, scope helpers, UI controls and meter audit trigger; no new reference records or tables.
- Use the same server validation for preview and save, plus a caller-authorized, row-locked database function for race-safe import writes and fresh relationship checks.
- Add focused parsing, matching, isolation and retry tests; verify available signed-in preview flows without silently changing live assignments.