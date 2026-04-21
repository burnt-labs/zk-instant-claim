use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Binary, Uint128};

use crate::state::ClaimStatus;

// ── Instantiate ───────────────────────────────────────────────────────────────

#[cw_serde]
pub struct InstantiateMsg {
    /// Admin address (defaults to sender).
    pub admin: Option<String>,
    /// Address of the deployed generic ZK verifier registry contract.
    pub verifier_contract: String,
    /// App ID already registered in the verifier registry for this handler.
    pub app_id: String,
    /// Minimum income in cents required for a claim to be approved.
    pub income_threshold_cents: u64,
    /// Maximum auto-payout in uUXION.
    pub max_auto_payout: Uint128,
}

// ── Execute ───────────────────────────────────────────────────────────────────

#[cw_serde]
pub enum ExecuteMsg {
    /// Primary entry-point called by the backend.
    ///
    /// Queries the generic verifier to validate the proof, cross-checks the
    /// public inputs against this contract's config, then pays out on success.
    ///
    /// `proof`         — raw UltraHonk proof bytes (binary).
    /// `public_inputs` — 5 × 32-byte BE field elements in circuit order:
    ///                   [check_date_epoch, claim_amount_cents,
    ///                    income_threshold_cents, max_auto_payout_cents,
    ///                    max_pay_stub_age_secs]
    SubmitClaim {
        wallet_address: String,
        claim_amount: Uint128,
        claim_id: String,
        proof: Binary,
        public_inputs: Binary,
    },

    /// Admin: withdraw contract balance (e.g. to top up from treasury).
    Withdraw {
        amount: Uint128,
        to: Option<String>,
    },

    /// Admin: update mutable config fields.
    UpdateConfig {
        income_threshold_cents: Option<u64>,
        max_auto_payout: Option<Uint128>,
        verifier_contract: Option<String>,
        app_id: Option<String>,
    },
}

// ── Query ─────────────────────────────────────────────────────────────────────

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(ClaimResponse)]
    GetClaim { id: String },

    #[returns(ListClaimsResponse)]
    ListClaims {
        wallet: String,
        start_after: Option<String>,
        limit: Option<u32>,
    },

    #[returns(ConfigResponse)]
    GetConfig {},
}

// ── Responses ─────────────────────────────────────────────────────────────────

#[cw_serde]
pub struct ClaimResponse {
    pub id: String,
    pub wallet_address: String,
    pub amount: Uint128,
    pub status: ClaimStatus,
    pub timestamp: u64,
    pub rejection_reason: Option<String>,
}

#[cw_serde]
pub struct ListClaimsResponse {
    pub claims: Vec<ClaimResponse>,
}

#[cw_serde]
pub struct ConfigResponse {
    pub admin: String,
    pub verifier_contract: String,
    pub app_id: String,
    pub income_threshold_cents: u64,
    pub max_auto_payout: Uint128,
}

// ── Verifier query types (inlined to avoid cross-crate dep) ───────────────────

/// Subset of the generic verifier's QueryMsg we need for inter-contract calls.
#[cw_serde]
pub enum VerifierQueryMsg {
    VerifyProof {
        app_id: String,
        proof: Binary,
        public_inputs: Binary,
    },
}

#[cw_serde]
pub struct VerifyResponse {
    pub valid: bool,
    pub app_id: String,
    pub proving_system: String,
}
