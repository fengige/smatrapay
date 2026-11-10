# Administrator commission save and table refresh

## Existing configuration mismatch
The current Commission Configuration form saves **one system-wide configuration**. Meter records can override commission and VAT percentages, but there is no persisted owner-specific configuration or owner-specific payer. The administrator table also currently has no Who Pays Commission column. The requested column must never fall back to that shared payer.

Independent owner saves cannot be implemented safely as a refresh-only fix: changing the existing shared form would affect other owners. The available uploaded screenshots do not show the referenced pricing table or Owner Commission Configuration form.

## Proposed scope
1. Keep the existing form, validation, pricing calculations and audit history intact.
2. After a successful save, refetch the persisted commission settings and relevant meter data before declaring the update complete. Do not copy unsaved form values into the table; retain error handling for failed saves and failed refreshes.
3. Add WHO PAYS COMMISSION beside COMMISSION and VAT ON COMM., with horizontally scrollable table layout on small screens. Never use a global payer. Resolve each meter's existing owner ID/type and use only an exact matching saved owner configuration for all three columns. If none exists, explicitly show **Not configured** rather than substitute global or per-meter values.
4. Refresh commission data with the page's Refresh action, on window focus and periodically, so another session's saved changes appear. Use the existing realtime hook only for already-published tables; pricing settings are not currently enabled for realtime.
5. Keep other portals, filters, sorting, bulk actions and pricing calculations unchanged. Add focused regression tests for refresh behavior, missing configurations and isolation between owners, including one owner with multiple meters.

## Owner-specific configuration decision
**The authoritative owner configuration source is a prerequisite for showing Owner/Resident and owner-specific rates.** The database and current application contain no such source. Please identify where the Owner Commission Configuration form is opened. If a new owner configuration feature is intended, its scope needs to be agreed separately; silently creating display-only settings would disagree with actual vending, while changing vending precedence would violate this task's calculation-preservation requirement.

## Technical details
- Reuse TanStack Query and existing authenticated server functions; share query keys for the administrator form and table.
- Await successful persisted-data refetch after saving; distinguish save failure from a saved change whose refresh failed.
- Avoid schema or vending-calculation changes in this refresh-only scope.
- Run focused tests and check preview errors. Attempt signed-in administrator verification; if no authorized administrator session can be obtained, report that limitation rather than claim live saves were verified.