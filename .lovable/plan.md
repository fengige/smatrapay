# Resident Pay-as-you-go payments

## What residents get
- A **Buy** button on eligible catalogue products, with a review of the down payment, instalment amount, frequency and number of payments.
- M-Pesa payment prompts using the product vendor’s existing enabled payment settings, with the existing platform fallback where configured.
- A **My Pay-as-you-go plans** section on the resident dashboard and catalogue showing confirmed amounts paid, remaining balance, instalment progress and payment status.
- A **Pay instalment** action after the down payment is confirmed. Pending or uncertain payments cannot trigger another charge.

## Payment and privacy safeguards
- Save a snapshot of the agreed product plan so later catalogue edits do not change an existing purchase.
- Derive all amounts on the server; use exact money values. HomePlus Max starts with KES 2,800, followed by 480 payments of KES 65.
- Residents can buy only products from vendors linked to their assigned meters and can read/pay only their own plans.
- Persist payment requests before contacting M-Pesa, prevent concurrent/duplicate submissions, and increase progress only after provider-verified confirmation.
- Reuse the existing M-Pesa transaction records and server-only credentials. Add isolated Pay-as-you-go confirmation handling without vending meter tokens or changing current token payments.
- Keep failures and uncertain payments available for investigation; never automatically retry a charge whose outcome is unknown.

## Technical implementation
- Add resident/vendor-scoped plan and payment-attempt records with explicit grants, RLS, immutable plan snapshots and atomic confirmation/idempotency operations.
- Add authenticated Pay-as-you-go server functions and a dedicated secured M-Pesa callback using existing Daraja helpers. Verify callback results with Daraja before crediting a plan.
- Add shared payment/progress controls to the existing resident catalogue and dashboard; preserve all vendor and admin pages.
- Test exact plan totals, first/subsequent payment amounts, failed/pending confirmations, duplicate callbacks, concurrent requests and resident isolation. Check resident review/progress screens at phone and desktop sizes.

## Configuration and limits
- No M-Pesa payment configuration currently exists for Kambasco or the platform. Buying must stay unavailable until enabled credentials and the publicly reachable callback are configured.
- Real money tests require a configured M-Pesa environment and explicit payment authorization; do not charge anyone merely to test the interface.
- This records purchases and payment progress. Product delivery and Sun King device unlocking are not configured and will not be claimed or simulated.
- Do not publish or change other portals.