# Commission payer implementation

- Administrator configuration saves the system payer and default rates; existing per-meter rate overrides remain authoritative.
- Resident uses unchanged deduction/gross-up helpers. Owner commission uses full payment as its basis, with VAT applied to commission; token amount stays full payment.
- Persist immutable server-prepared terms before provider calls; stable purchase keys reuse them on callbacks/retries.
- Token insertion atomically posts one owner liability, linked to the token. Liability totals are an owner balance, not a fabricated cash-wallet balance. Token revocation alone is not a refund; no money-refund workflow currently exists.
- Keep other portals' UI unchanged, while shared server reads, exports and SMS carry correct amounts and payer snapshots.