use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::{Item, Map};
use serde::{Deserialize, Serialize};

// ── Config ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Config {
    pub admin: Addr,
    /// The generic ZK verifier registry contract address.
    pub verifier_contract: Addr,
    /// App ID registered in the generic verifier for this handler.
    pub app_id: String,
    /// Minimum gross pay in cents required for auto-approval (e.g. 300000 = $3,000).
    pub income_threshold_cents: u64,
    /// Maximum claim amount in uUXION (e.g. 500_000_000 = $500 at 1 UXION = $0.001).
    pub max_auto_payout: Uint128,
}

// ── Claims ────────────────────────────────────────────────────────────────────

#[cw_serde]
pub enum ClaimStatus {
    Approved,
    Rejected,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Claim {
    pub id: String,
    pub wallet_address: String,
    pub amount: Uint128,
    pub status: ClaimStatus,
    pub timestamp: u64,
    pub rejection_reason: Option<String>,
}

// ── Storage ───────────────────────────────────────────────────────────────────

pub const CONFIG: Item<Config> = Item::new("config");

/// claim_id → Claim
pub const CLAIMS: Map<&str, Claim> = Map::new("claims");

/// wallet_address → [claim_id, ...]
pub const WALLET_CLAIMS: Map<&str, Vec<String>> = Map::new("wallet_claims");
