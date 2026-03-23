use cosmwasm_std::Uint128;
use cw_storage_plus::{Item, Map};
use serde::{Deserialize, Serialize};

use crate::msg::ClaimStatus;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Config {
    /// Name of the vkey registered on-chain with `xiond tx zk add-vkey`
    pub vkey_name: String,
    /// Informational treasury address
    pub treasury_address: String,
    pub income_threshold_cents: u64,
    pub max_auto_payout: Uint128,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Claim {
    pub id: String,
    pub wallet_address: String,
    pub claim_amount: Uint128,
    pub status: ClaimStatus,
    pub timestamp: u64,
    pub rejection_reason: Option<String>,
}

pub const CONFIG: Item<Config> = Item::new("config");

/// Primary index: claim_id -> Claim
pub const CLAIMS: Map<&str, Claim> = Map::new("claims");

/// Secondary index: wallet_address -> Vec<claim_id>
pub const WALLET_CLAIMS: Map<&str, Vec<String>> = Map::new("wallet_claims");
