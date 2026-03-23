// Income Threshold Verifier
//
// Proves that a claimant's gross pay is above a minimum threshold
// and that the claim amount is within the auto-payout ceiling,
// WITHOUT revealing the actual gross pay amount.
//
// Private inputs (hidden from verifier/chain):
//   gross_pay_cents: u64 - Raw gross pay in cents (e.g., 1000000 = $10,000)
//
// Public inputs (visible on chain):
//   check_date_epoch:       u64 - Unix timestamp of the pay stub date
//   claim_amount_cents:     u64 - Amount the claimant is requesting, in cents
//   income_threshold_cents: u64 - Minimum gross pay required, in cents
//   max_auto_payout_cents:  u64 - Maximum auto-payout ceiling, in cents
//   max_pay_stub_age_secs:  u64 - Max allowed age of pay stub (unix timestamp lower bound)

fn main(
    gross_pay_cents: u64,
    check_date_epoch: pub u64,
    claim_amount_cents: pub u64,
    income_threshold_cents: pub u64,
    max_auto_payout_cents: pub u64,
    max_pay_stub_age_secs: pub u64,
) {
    // Constraint 1: Income is above the minimum threshold
    // Proves salary qualification without revealing exact income
    assert(gross_pay_cents >= income_threshold_cents);

    // Constraint 2: Claim is within the auto-payout ceiling
    // Prevents abuse of auto-approval for large claims
    assert(claim_amount_cents <= max_auto_payout_cents);

    // Constraint 3: Pay stub is recent enough to be valid
    // Prevents use of stale income data
    // check_date_epoch must be >= max_pay_stub_age_secs (a unix timestamp floor)
    assert(check_date_epoch >= max_pay_stub_age_secs);
}
