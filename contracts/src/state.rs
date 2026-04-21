use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};
use serde::{Deserialize, Serialize};

use crate::verifier::ProvingSystem;

// ── Contract-level config ─────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Config {
    /// Contract admin — can do nothing extra right now, but reserved for
    /// future governance (pausing, fee params, etc.).
    pub admin: Addr,
}

// ── App registry ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct App {
    /// Unique identifier chosen by the registrant.
    pub app_id: String,

    /// Address that owns this app entry (can update/remove it).
    pub owner: Addr,

    /// Verification key name registered on-chain via `xiond tx zk add-vkey`.
    pub vkey_name: String,

    /// Which ZK proving system to use for verification.
    pub proving_system: ProvingSystem,

    /// Optional CosmWasm contract to call after successful proof verification.
    /// Receives a `ProofVerified { app_id, public_inputs, submitter }` execute message.
    /// If None, the contract only verifies and emits an event.
    pub handler: Option<Addr>,

    /// Soft-disable without removing. Disabled apps reject all SubmitProof calls.
    pub enabled: bool,

    /// Block time at registration (seconds).
    pub created_at: u64,

    /// Total successful verifications — useful for indexers / explorers.
    pub proof_count: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

pub const CONFIG: Item<Config> = Item::new("config");

/// Primary app registry: app_id → App
pub const APPS: Map<&str, App> = Map::new("apps");
