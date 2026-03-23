use cosmwasm_std::{
    entry_point, to_json_binary, BankMsg, Binary, Coin, ContractResult, Deps, DepsMut,
    Env, GrpcQuery, MessageInfo, QueryRequest, Response, StdError, StdResult, SystemResult,
    Uint128,
};


use crate::error::ContractError;
use crate::msg::{
    ClaimStatus, ClaimStatusResponse, ConfigResponse, ExecuteMsg,
    InstantiateMsg, ListClaimsResponse, QueryMsg,
};
use crate::state::{Claim, Config, CLAIMS, CONFIG, WALLET_CLAIMS};


const ZK_VERIFY_PATH: &str = "/xion.zk.v1.Query/ProofVerifyUltraHonk";

/// Manually encode a QueryVerifyUltraHonkRequest protobuf message.
///
/// Proto definition (from proto/xion/zk/v1/query.proto):
///   message QueryVerifyUltraHonkRequest {
///     bytes proof         = 1;
///     bytes public_inputs = 2;
///     string vkey_name    = 3;
///   }
fn encode_verify_request(proof: &[u8], public_inputs: &[u8], vkey_name: &str) -> Vec<u8> {
    let mut buf = Vec::new();

    // field 1: bytes proof (tag = 0x0a)
    if !proof.is_empty() {
        buf.push(0x0a);
        encode_varint(proof.len() as u64, &mut buf);
        buf.extend_from_slice(proof);
    }

    // field 2: bytes public_inputs (tag = 0x12)
    if !public_inputs.is_empty() {
        buf.push(0x12);
        encode_varint(public_inputs.len() as u64, &mut buf);
        buf.extend_from_slice(public_inputs);
    }

    // field 3: string vkey_name (tag = 0x1a)
    let name_bytes = vkey_name.as_bytes();
    if !name_bytes.is_empty() {
        buf.push(0x1a);
        encode_varint(name_bytes.len() as u64, &mut buf);
        buf.extend_from_slice(name_bytes);
    }

    buf
}

/// Manually decode a ProofVerifyResponse protobuf message.
///
/// Proto definition (from proto/xion/zk/v1/query.proto):
///   message ProofVerifyResponse {
///     bool valid = 1;
///   }
fn decode_verify_response(data: &[u8]) -> StdResult<bool> {
    let mut i = 0;
    while i < data.len() {
        let tag_byte = data[i];
        i += 1;
        let field_number = tag_byte >> 3;
        let wire_type = tag_byte & 0x07;

        match (field_number, wire_type) {
            // field 1, varint: bool valid
            (1, 0) => {
                let (val, consumed) = decode_varint(&data[i..])?;
                i += consumed;
                return Ok(val != 0);
            }
            // skip unknown fields
            (_, 0) => {
                let (_, consumed) = decode_varint(&data[i..])?;
                i += consumed;
            }
            (_, 2) => {
                let (len, consumed) = decode_varint(&data[i..])?;
                i += consumed + len as usize;
            }
            _ => {
                return Err(StdError::generic_err("unexpected protobuf wire type in response"));
            }
        }
    }
    // Default false if field not present
    Ok(false)
}

/// Convert the public_inputs Vec<String> (decimal u64 values) into the 160-byte
/// concatenated big-endian 32-byte field element format expected by the verifier.
/// Each u64 is zero-padded to 32 bytes (24 zero bytes + 8-byte big-endian).
fn public_inputs_to_bytes(inputs: &[String]) -> StdResult<Vec<u8>> {
    let mut buf = Vec::with_capacity(inputs.len() * 32);
    for s in inputs {
        let val: u64 = s
            .parse()
            .map_err(|_| StdError::generic_err(format!("invalid public input: {}", s)))?;
        // 24 zero bytes followed by 8-byte big-endian u64
        buf.extend_from_slice(&[0u8; 24]);
        buf.extend_from_slice(&val.to_be_bytes());
    }
    Ok(buf)
}

fn encode_varint(mut val: u64, buf: &mut Vec<u8>) {
    loop {
        let byte = (val & 0x7f) as u8;
        val >>= 7;
        if val == 0 {
            buf.push(byte);
            break;
        } else {
            buf.push(byte | 0x80);
        }
    }
}

fn decode_varint(data: &[u8]) -> StdResult<(u64, usize)> {
    let mut result: u64 = 0;
    let mut shift = 0u32;
    for (i, &byte) in data.iter().enumerate() {
        result |= ((byte & 0x7f) as u64) << shift;
        if byte & 0x80 == 0 {
            return Ok((result, i + 1));
        }
        shift += 7;
        if shift >= 64 {
            return Err(StdError::generic_err("varint overflow"));
        }
    }
    Err(StdError::generic_err("truncated varint"))
}

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    let config = Config {
        vkey_name: msg.vkey_name,
        treasury_address: msg.treasury_address,
        income_threshold_cents: msg.income_threshold_cents,
        max_auto_payout: msg.max_auto_payout,
    };
    CONFIG.save(deps.storage, &config)?;
    Ok(Response::new().add_attribute("action", "instantiate"))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::SubmitClaim {
            noir_proof,
            public_inputs,
            reclaim_proof_json,
            wallet_address,
            claim_amount,
            claim_id,
        } => execute_submit_claim(
            deps,
            env,
            noir_proof,
            public_inputs,
            reclaim_proof_json,
            wallet_address,
            claim_amount,
            claim_id,
        ),
    }
}

pub fn execute_submit_claim(
    deps: DepsMut,
    env: Env,
    noir_proof: String,
    public_inputs: Vec<String>,
    _reclaim_proof_json: String,
    wallet_address: String,
    claim_amount: Uint128,
    claim_id: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Guard: claim must be within auto-payout ceiling
    if claim_amount > config.max_auto_payout {
        return Err(ContractError::ClaimExceedsCeiling {
            amount: claim_amount,
            ceiling: config.max_auto_payout,
        });
    }

    // Guard: don't process duplicate claim IDs
    if CLAIMS.has(deps.storage, &claim_id) {
        return Err(ContractError::DuplicateClaim { id: claim_id });
    }

    // =========================================================
    // PROOF VERIFICATION — xion native ZK module (barretenberg)
    // Calls /xion.zk.v1.Query/ProofVerifyUltraHonk via GrpcQuery.
    // The path is whitelisted in the chain's CosmWasm configuration.
    // =========================================================
    let proof_bytes = hex::decode(&noir_proof)
        .map_err(|_| ContractError::InvalidProof("hex decode failed".to_string()))?;

    let public_inputs_bytes = public_inputs_to_bytes(&public_inputs)
        .map_err(|e| ContractError::InvalidProof(e.to_string()))?;

    let request_bytes =
        encode_verify_request(&proof_bytes, &public_inputs_bytes, &config.vkey_name);

    // The chain returns raw protobuf bytes (confirmed: 0x08 0x01 for verified=true).
    // Use raw_query + manual protobuf decode instead of deps.querier.query::<T>().
    let grpc_request = QueryRequest::<cosmwasm_std::Empty>::Grpc(GrpcQuery {
        path: ZK_VERIFY_PATH.to_string(),
        data: Binary::from(request_bytes),
    });
    let raw = deps
        .querier
        .raw_query(&to_json_binary(&grpc_request).map_err(|e| ContractError::InvalidProof(e.to_string()))?);

    let proto_bytes = match raw {
        SystemResult::Err(e) => {
            return Err(ContractError::InvalidProof(format!("system_err: {}", e)));
        }
        SystemResult::Ok(ContractResult::Err(e)) => {
            return Err(ContractError::InvalidProof(format!("contract_err: {}", e)));
        }
        SystemResult::Ok(ContractResult::Ok(bin)) => bin,
    };

    let proof_valid = decode_verify_response(proto_bytes.as_slice())
        .map_err(|e| ContractError::InvalidProof(e.to_string()))?;

    let timestamp = env.block.time.seconds();

    if proof_valid {
        let claim = Claim {
            id: claim_id.clone(),
            wallet_address: wallet_address.clone(),
            claim_amount,
            status: ClaimStatus::Approved,
            timestamp,
            rejection_reason: None,
        };
        CLAIMS.save(deps.storage, &claim_id, &claim)?;

        let mut wallet_claim_ids = WALLET_CLAIMS
            .may_load(deps.storage, &wallet_address)?
            .unwrap_or_default();
        wallet_claim_ids.push(claim_id.clone());
        WALLET_CLAIMS.save(deps.storage, &wallet_address, &wallet_claim_ids)?;

        let payout_msg = BankMsg::Send {
            to_address: wallet_address.clone(),
            amount: vec![Coin {
                denom: "uxion".to_string(),
                amount: claim_amount,
            }],
        };

        Ok(Response::new()
            .add_message(payout_msg)
            .add_attribute("action", "claim_approved")
            .add_attribute("claim_id", claim_id)
            .add_attribute("wallet", wallet_address)
            .add_attribute("amount", claim_amount.to_string()))
    } else {
        let claim = Claim {
            id: claim_id.clone(),
            wallet_address: wallet_address.clone(),
            claim_amount,
            status: ClaimStatus::Rejected,
            timestamp,
            rejection_reason: Some("Proof verification failed".to_string()),
        };
        CLAIMS.save(deps.storage, &claim_id, &claim)?;

        Ok(Response::new()
            .add_attribute("action", "claim_rejected")
            .add_attribute("claim_id", claim_id)
            .add_attribute("reason", "proof_invalid"))
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetClaim { id } => to_json_binary(&query_claim(deps, id)?),
        QueryMsg::ListClaims {
            wallet,
            start_after,
            limit,
        } => to_json_binary(&query_list_claims(deps, wallet, start_after, limit)?),
        QueryMsg::GetConfig {} => to_json_binary(&query_config(deps)?),
    }
}

fn query_claim(deps: Deps, id: String) -> StdResult<ClaimStatusResponse> {
    let claim = CLAIMS.load(deps.storage, &id)?;
    Ok(ClaimStatusResponse {
        id: claim.id,
        wallet_address: claim.wallet_address,
        claim_amount: claim.claim_amount,
        status: claim.status,
        tx_hash: None,
        timestamp: claim.timestamp,
        rejection_reason: claim.rejection_reason,
    })
}

fn query_list_claims(
    deps: Deps,
    wallet: String,
    _start_after: Option<String>,
    limit: Option<u32>,
) -> StdResult<ListClaimsResponse> {
    let limit = limit.unwrap_or(10) as usize;
    let claim_ids = WALLET_CLAIMS
        .may_load(deps.storage, &wallet)?
        .unwrap_or_default();

    let claims: Vec<ClaimStatusResponse> = claim_ids
        .iter()
        .take(limit)
        .filter_map(|id| CLAIMS.load(deps.storage, id).ok())
        .map(|c| ClaimStatusResponse {
            id: c.id,
            wallet_address: c.wallet_address,
            claim_amount: c.claim_amount,
            status: c.status,
            tx_hash: None,
            timestamp: c.timestamp,
            rejection_reason: c.rejection_reason,
        })
        .collect();

    Ok(ListClaimsResponse { claims })
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        vkey_name: config.vkey_name,
        treasury_address: config.treasury_address,
        income_threshold_cents: config.income_threshold_cents,
        max_auto_payout: config.max_auto_payout,
    })
}
