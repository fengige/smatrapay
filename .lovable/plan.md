# Property Owner Details

## Summary
Update the property details page so its ownership section reflects the selected owner type instead of always treating the owner as a landlord.

## Changes
- Rename the “Landlord detail” tab to “Owner Details”.
- Read the property’s `owner_type` and use the linked owner record already returned with the property.
- Show owner-specific empty states, names, and labels for Landlord, Agent, or Vendor.
- Route “View … Profile” and edit actions to the matching Landlord, Agent, or Vendor account pages on desktop and mobile.
- Update the page description metadata to refer to owners rather than landlords.

## Technical details
- Keep the existing property-owner relationship and query; the shared owner ID points to the selected account in the users table.
- Use typed owner route mappings so each owner type resolves to its existing detail and edit route.
- Preserve the existing tab layout, profile card, permissions, and styling.

## Verification
- Confirm the project builds successfully.
- Check the property details page for correct Owner Details labels and owner-specific links.
