# Administrator commission save and table refresh

## Existing configuration mismatch
The current Commission Configuration form saves **one system-wide configuration**. Meter records can override commission and VAT percentages, but there is no persisted owner-specific configuration or owner-specific payer. The administrator table also currently has no Who Pays Commission column.

Independent owner saves cannot be implemented safely as a refresh-only fix: changing the existing shared form would affect other owners. No screenshot is available in the current conversation context.

## Proposed scope
1. Keep the existing form, validation, pricing calculations and audit history intact.
2. After a successful save, refetch the persisted commission settings and relevant meter data before declaring the update complete. Do not copy unsaved form values into the table; retain error handling for failed saves and failed refreshes.
3. Add Who Pays Commission to the administrator table using the saved system-wide payer, clearly retaining existing per-meter commission/VAT overrides rather than misrepresenting them as owner-specific values.
4. Refresh commission data with the page's Refresh action, on window focus and periodically, so another session's saved changes appear. Use the existing realtime hook only for already-published tables; pricing settings are not currently enabled for realtime.
5. Keep other portals unchanged and add focused regression tests for refresh behavior and preservation of independent meter overrides.

## Owner-specific configuration decision
**This plan fixes synchronization of the existing configuration, not independent owner configuration.** If independent Owner Commission Configuration is intended, please identify the form shown in the screenshot or provide the screenshot again. Alternatively, request a new per-owner configuration feature; that needs an agreed precedence relative to existing meter overrides and the system-wide defaults so displayed settings and actual vending remain consistent.

## Technical details
- Reuse TanStack Query and existing authenticated server functions; share query keys for the administrator form and table.
- Await successful persisted-data refetch after saving; distinguish save failure from a saved change whose refresh failed.
- Avoid schema or vending-calculation changes in this refresh-only scope.
- Run focused tests and check preview errors. Attempt signed-in administrator verification; if no authorized administrator session can be obtained, report that limitation rather than claim live saves were verified.