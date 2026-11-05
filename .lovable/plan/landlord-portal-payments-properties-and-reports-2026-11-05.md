# Landlord portal payments, properties and reports

## What will change
- Keep the dashboard, and add expandable **Payments**, **Properties**, and **Reports & Analysis** groups only in the landlord sidebar.
- Payments will link to **Recent Tokens**, **Vending Records**, and the existing **Bank Payments** page. Recent Tokens includes issued token and transaction details; Vending Records includes property/date filters, search, totals and server pagination, defaulting to today.
- Extend landlord Bank Payments with a property selector and visible date filters, retaining failure reasons, safe meter correction and individual retries.
- Add **My Properties** showing linked properties across all managing vendors, their authorized units and correctly associated Electricity, Water and Gas meters, plus vendor names when available.
- Add **Revenue Report**, **Consumption Report**, and **All Properties Summary Report**, with the requested filters, Generate Report action, underlying reconciled totals, and PDF/Excel downloads.

## Reporting assumptions
- “Token Amount” means the stored money amount available for vending after commission and VAT, not token quantity. “Tax” means the stored VAT on commission.
- Daily/monthly dates follow the existing Nairobi reporting timezone. Vending Records initially shows today.
- Reports retain received payments whose token failed; absent token values remain unavailable rather than implying successful vending. Successful bank payments and their tokens are counted once using the existing unified transaction source.
- Consumption shows actual issued token quantity as **vended quantity** (Electricity: kWh; Water/Gas: only the meter's stored unit label). It is not a measured meter reading; missing quantities/labels are explicitly unavailable.
- Where only particular units or meters link a landlord to a property, expose only those authorized units/meters, not other owners' units in the same property.

## Technical approach
- Reuse existing protected landlord routes, shared layout, database tables, transaction view, bank-payment workflows, money formatting, and PDF/Excel libraries.
- Resolve landlord identity from the authenticated session and derive scope from property ownership, active landlord unit assignments, and direct meter assignment; never accept a landlord or vendor ID from the browser.
- Keep ordinary reads RLS-bound. Add narrowly scoped read policies/helpers only where the existing schema cannot read the authorized cross-vendor relationships; no duplicate tables or payment fields.
- Share server-side report filtering, decimal-safe aggregation, pagination and exports. Traverse all matching records without silently truncating totals; exports exclude credentials and unnecessary personal details.
- Add focused tests for cross-landlord isolation, multi-vendor links, date boundaries, exact financial totals, grouping, unavailable quantities, and no bank/token double-counting.

## Verification
- Run relevant existing and new tests and check the preview's compilation result.
- Exercise landlord menus, filters, report generation, page navigation and PDF/Excel downloads at desktop/mobile widths using an authorized session if one is available.
- No publishing, live vending, retries or payment corrections will be performed as part of verification. If authenticated access requires user approval, report that limitation explicitly.