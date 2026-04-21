use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Binary;

use crate::verifier::ProvingSystem;

// ── Instantiate ───────────────────────────────────────────────────────────────

#[cw_serde]
pub struct InstantiateMsg {
    /// Contract admin. Defaults to the instantiator if omitted.
    pub admin: Option<String>,
}

// ── Execute ───────────────────────────────────────────────────────────────────

#[cw_serde]
pub enum ExecuteMsg {
    // ── App lifecycle ─────────────────────────────────────────────────────────

    /// Register a new app in the verifier registry.
    /// The caller becomes the app owner.
    RegisterApp {
        /// Unique identifier for this app. Immutable after registration.
        app_id: String,
        /// Vkey name registered on-chain via `xiond tx zk add-vkey`.
        vkey_name: String,
        /// Which proving system to use when verifying proofs for this app.
        proving_system: ProvingSystem,
        /// Optional handler contract to invoke after a successful proof.
        /// Must implement `ExecuteMsg::ProofVerified { ... }`.
        handler: Option<String>,
    },

    /// Update mutable fields of an existing app.
    /// Only the app owner can call this.
    UpdateApp {
        app_id: String,
        /// Pass Some(addr) to set a new handler, Some("") to clear it,
        /// or omit the field entirely to leave it unchanged.
        handler: Option<String>,
        /// Enable or disable the app.
        enabled: Option<bool>,
    },

    /// Permanently remove an app from the registry.
    /// Only the app owner can call this.
    RemoveApp { app_id: String },

    // ── Proof submission ──────────────────────────────────────────────────────

    /// Submit a proof for verification under a registered app.
    ///
    /// `proof`         — raw proof bytes (system-dependent format).
    /// `public_inputs` — pre-encoded public inputs bytes.
    ///                   For UltraHonk: 32-byte BE field elements
    ///                     (use backend helper: u64 → 24 zero bytes + 8 BE bytes).
    ///                   For Groth16/Gnark: whatever the circuit emits.
    ///
    /// On success: emits `wasm-proof_verified` event and, if a handler is set,
    /// calls the handler with a `ProofVerified` execute message.
    SubmitProof {
        app_id: String,
        proof: Binary,
        public_inputs: Binary,
    },
}

/// Message sent to the handler contract after a successful verification.
/// The handler contract must include this variant in its own ExecuteMsg.
#[cw_serde]
pub enum HandlerExecuteMsg {
    ProofVerified {
        /// The app_id this proof was submitted for.
        app_id: String,
        /// The raw public_inputs bytes that were verified.
        /// The handler knows the schema (it chose the vkey and circuit).
        public_inputs: Binary,
        /// msg.sender — who submitted the proof.
        submitter: String,
    },
}

// ── Query ─────────────────────────────────────────────────────────────────────

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Fetch a single app by ID.
    #[returns(AppResponse)]
    GetApp { app_id: String },

    /// Paginated list of all registered apps.
    #[returns(ListAppsResponse)]
    ListApps {
        start_after: Option<String>,
        limit: Option<u32>,
    },

    /// Read-only proof verification — no state changes, no handler call.
    /// Useful for backends that want to pre-check before submitting on-chain.
    #[returns(VerifyResponse)]
    VerifyProof {
        app_id: String,
        proof: Binary,
        public_inputs: Binary,
    },
}

// ── Response types ────────────────────────────────────────────────────────────

#[cw_serde]
pub struct AppResponse {
    pub app_id: String,
    pub owner: String,
    pub vkey_name: String,
    pub proving_system: ProvingSystem,
    pub handler: Option<String>,
    pub enabled: bool,
    pub created_at: u64,
    pub proof_count: u64,
}

#[cw_serde]
pub struct ListAppsResponse {
    pub apps: Vec<AppResponse>,
}

#[cw_serde]
pub struct VerifyResponse {
    pub valid: bool,
    pub app_id: String,
    pub proving_system: String,
}
