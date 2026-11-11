# Owner and property commission targeting

## Changes
- Add required Select Owner type: Landlord, Vendor, or Agent; show only matching accounts with searchable choices.
- Add required Select Property scope: All Properties or Specific Property. Show only properties linked to the selected account, and clear account/property selections when their parent changes.
- Block saving when required selections are missing or the owner has no linked properties.
- Persist targeting alongside payer and rates, using the existing owner and owner/property configurations rather than duplicate records.
- Validate account role and property relationships on the server before saving. Preserve change history and refresh all affected table rows immediately after successful saves.

## Precedence and preservation
Property-specific settings override that same owner's All Properties settings only for that property. All Properties saves leave existing overrides intact. Missing settings remain Not configured. Pricing calculations, integrations, filters, and other portals remain unchanged.

## Technical details
Inspect direct property ownership and meter → unit → property links; use complete admin-authorized reads for eligible accounts/properties. Extend existing settings with targeting metadata and audited snapshots. Retain existing periodic/focus/realtime refresh.

## Verification
Test each owner type, required targets, unrelated property rejection, owners without properties, precedence and successful-save refresh. Check desktop/mobile controls; authenticated save verification requires an available administrator session.
