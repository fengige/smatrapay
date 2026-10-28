import type { PaygPlanView } from "./payg-payment";

/** Allowlist AI context: no identifiers, credentials, phone numbers or raw errors. */
export function paygSupportFacts(plans: PaygPlanView[]) {
  return plans.map(plan => ({
    product_name: plan.product_name,
    currency: "KES",
    down_payment_cents: plan.down_payment_cents,
    instalment_cents: plan.instalment_cents,
    instalment_count: plan.instalment_count,
    frequency: plan.frequency,
    total_cents: plan.total_cents,
    confirmed_paid_cents: plan.paid_cents,
    remaining_cents: plan.remaining_cents,
    instalments_paid: plan.instalments_paid,
    next_payment_cents: plan.next_payment_cents,
    payment_needs_confirmation: plan.pending,
    recent_payments: plan.payments.slice(0, 5).map(payment => ({
      amount_cents: payment.amount_cents, status: payment.status, created_at: payment.created_at,
    })),
  }));
}