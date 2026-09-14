# Meter Supplier Details & Meter Management

Add a dedicated details page for each meter supplier, with a profile photo, full supplier
information, and a supplier-scoped meter register that reuses the existing meter system.

## What already exists (reused, not duplicated)

- Supplier records: company name, licence number, utility type, contact name, email, phone,
  website, status, created/updated dates.
- Meters already store the supplier they came from, plus vendor/landlord/agent owner, meter
  number, serial number, type, STS values (SGC, KRN, TI, EA, KEN), status and dates.
- Existing add-meter, bulk-add (single database transaction with per-row results), view,
  edit, activate/deactivate and delete actions, and the meter change history trail.
- Existing photo upload/crop components and the private avatars storage.

The only new database change is one field on the supplier record to hold its photo.
No new supplier, user or meter storage is created.

## 1. Meter Suppliers listing

Add a "View Details" action to each row (alongside Edit and Activate/Deactivate), linking to
the new details page with the supplier's real ID. Company name also becomes a link.

## 2. Supplier Details page (`/meter-suppliers/$supplierId`)

Breadcrumb: Meter Suppliers → [Supplier name], plus a "Back to Meter Suppliers" action.
Supplier name shown prominently with status badge. Two tabs: Supplier Info, Meters Supplied.
Loads only real data for that supplier; a missing/invalid ID shows a clear not-found state.

## 3. Supplier Info tab

- Photo block: current photo or initials avatar, with upload/change (crop, size and type
  checks), view full size, and remove. Stored against the supplier record itself.
- Information card: company name, utility type, licence number, contact person, email,
  phone, website, status, created and last-updated dates. Fields with no value show "—".
- Actions: Edit Supplier (reuses the existing supplier form) and Activate/Deactivate.
  Every change refreshes the page data immediately and shows a success message.

## 4. Meters Supplied tab

- Summary cards from live data for this supplier: total, electricity, water, gas, active,
  inactive.
- Table: meter number, serial number, type, supplier, owner type, assigned user, SGC, KRN,
  TI, EA, KEN, status, date added, actions (view, edit, activate/deactivate, delete — all
  reusing existing meter behaviour).
- Search across meter number, serial number and assigned user name; filters for type, owner
  type, status and date-added range; pagination; "Meters Supplied: N" count.
- "+ Add Meter" opens the meter form with this supplier pre-filled and locked; validates
  required fields, meter type, unique meter number, and owner selection.
- "+ Bulk Add Meters" opens the existing bulk workflow with this supplier pre-selected and
  locked, returning to the supplier page afterwards. Batch validation and all-or-nothing
  creation stay as they are today.
- Both paths save the supplier link server-side, so one supplier's list never shows another's
  meters.

## 5. Security

All reads and writes go through admin-checked server functions; the supplier link is set and
verified on the server, not from the page. Hiding buttons is never the only protection.

## Technical notes

- Migration: add `logo_url text` to `public.meter_suppliers` (photo stored in the existing
  private avatars bucket, signed URL saved on the supplier row).
- New server functions in `src/lib/suppliers.functions.ts`: `getSupplier` (supplier + meter
  summary) and `setSupplierLogo`; `listSupplierMeters` filtered by `supplier_id` with owner
  names resolved from `users`.
- New route `src/routes/_authenticated/meter-suppliers.$supplierId.tsx` using `PortalLayout`,
  with the supplier form extracted for reuse by the listing and the details page.
- `meters/bulk-add` accepts a `?supplier=<id>&return=<path>` search param to lock the supplier
  and return to the details page.
- Meter changes continue to be recorded by the existing meter history triggers.
