/// Proving-system abstraction.
/// Each variant maps to a distinct Xion native ZK module RPC path.

use cosmwasm_std::{
    to_json_binary, Binary, ContractResult, Deps, GrpcQuery, QueryRequest,
    SystemResult,
};
use cosmwasm_schema::cw_serde;

use crate::error::ContractError;
use crate::proto::{decode_verify_response, encode_verify_request};

// ── Proving system enum ───────────────────────────────────────────────────────

#[cw_serde]
pub enum ProvingSystem {
    /// Barretenberg UltraHonk (Noir circuits).
    /// RPC: /xion.zk.v1.Query/ProofVerifyUltraHonk
    UltraHonk,

    /// Groth16 (Circom circuits).
    /// RPC: /xion.zk.v1.Query/ProofVerify
    Groth16,

    /// Gnark Groth16/PLONK.
    /// RPC: /xion.zk.v1.Query/ProofVerifyGnark
    Gnark,
}

impl ProvingSystem {
    pub fn grpc_path(&self) -> &'static str {
        match self {
            ProvingSystem::UltraHonk => "/xion.zk.v1.Query/ProofVerifyUltraHonk",
            ProvingSystem::Groth16   => "/xion.zk.v1.Query/ProofVerify",
            ProvingSystem::Gnark     => "/xion.zk.v1.Query/ProofVerifyGnark",
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            ProvingSystem::UltraHonk => "ultrahonk",
            ProvingSystem::Groth16   => "groth16",
            ProvingSystem::Gnark     => "gnark",
        }
    }
}

// ── Core verify call ──────────────────────────────────────────────────────────

/// Call the Xion native ZK module via GrpcQuery and return whether the proof
/// is valid. Works for all three proving systems.
///
/// `proof`         — raw proof bytes
/// `public_inputs` — pre-encoded public inputs bytes (format is system-specific;
///                   for UltraHonk use `proto::encode_ultrahonk_inputs`)
/// `vkey_name`     — the name the vkey was registered under on-chain
pub fn verify_proof(
    deps: Deps,
    system: &ProvingSystem,
    proof: &[u8],
    public_inputs: &[u8],
    vkey_name: &str,
) -> Result<bool, ContractError> {
    let request_bytes = encode_verify_request(proof, public_inputs, vkey_name);

    let grpc_request = QueryRequest::<cosmwasm_std::Empty>::Grpc(GrpcQuery {
        path: system.grpc_path().to_string(),
        data: Binary::from(request_bytes),
    });

    let query_bin = to_json_binary(&grpc_request)
        .map_err(|e| ContractError::VerifierError(e.to_string()))?;

    let raw = deps.querier.raw_query(&query_bin);

    let proto_bytes = match raw {
        SystemResult::Err(e) => {
            return Err(ContractError::VerifierError(format!("system_err: {}", e)));
        }
        SystemResult::Ok(ContractResult::Err(e)) => {
            return Err(ContractError::VerifierError(format!("contract_err: {}", e)));
        }
        SystemResult::Ok(ContractResult::Ok(bin)) => bin,
    };

    decode_verify_response(proto_bytes.as_slice())
        .map_err(|e| ContractError::VerifierError(e.to_string()))
}
