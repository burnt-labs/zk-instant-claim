use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Uint128;

#[cw_serde]
pub struct InstantiateMsg {
    /// Name of the verification key registered on-chain via `xiond tx zk add-vkey`
    pub vkey_name: String,
    /// Treasury address (informational — payouts come from contract balance)
    pub treasury_address: String,
    /// Minimum income threshold in cents (e.g. 300000 = $3,000)
    pub income_threshold_cents: u64,
    /// Maximum auto-payout in uUXION
    pub max_auto_payout: Uint128,
}

#[cw_serde]
pub enum ExecuteMsg {
    SubmitClaim {
        /// Hex-encoded UltraHonk proof bytes (from bb prove)
        noir_proof: String,
        /// Public inputs in order: [check_date_epoch, claim_amount_cents,
        /// income_threshold_cents, max_auto_payout_cents, max_pay_stub_age_secs]
        /// Each as decimal string matching the Noir circuit signature
        public_inputs: Vec<String>,
        /// Serialized Reclaim proof JSON — stored for audit trail
        reclaim_proof_json: String,
        /// Claimant's Xion wallet address to receive payout
        wallet_address: String,
        /// Claim amount in uUXION
        claim_amount: Uint128,
        /// Human-readable claim ID from backend (UUID)
        claim_id: String,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(ClaimStatusResponse)]
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

#[cw_serde]
pub struct ClaimStatusResponse {
    pub id: String,
    pub wallet_address: String,
    pub claim_amount: Uint128,
    pub status: ClaimStatus,
    pub tx_hash: Option<String>,
    pub timestamp: u64,
    pub rejection_reason: Option<String>,
}

#[cw_serde]
pub enum ClaimStatus {
    Pending,
    Approved,
    Rejected,
}

#[cw_serde]
pub struct ListClaimsResponse {
    pub claims: Vec<ClaimStatusResponse>,
}

#[cw_serde]
pub struct ConfigResponse {
    pub vkey_name: String,
    pub treasury_address: String,
    pub income_threshold_cents: u64,
    pub max_auto_payout: Uint128,
}
