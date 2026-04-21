use cosmwasm_std::{
    entry_point, to_json_binary, BankMsg, Binary, Coin, Deps, DepsMut, Env,
    MessageInfo, QueryRequest, Response, StdResult, Uint128, WasmQuery,
};

use crate::error::ContractError;
use crate::msg::{
    ClaimResponse, ConfigResponse, ExecuteMsg, InstantiateMsg, ListClaimsResponse,
    QueryMsg, VerifierQueryMsg, VerifyResponse,
};
use crate::state::{Claim, ClaimStatus, Config, CLAIMS, CONFIG, WALLET_CLAIMS};

const DEFAULT_LIMIT: u32 = 10;
const MAX_LIMIT: u32 = 50;

// ── Public input indices (circuit order) ─────────────────────────────────────
// Each is a 32-byte BE field element: 24 zero bytes + 8-byte big-endian u64.

const IDX_CHECK_DATE_EPOCH: usize = 0;
const IDX_CLAIM_AMOUNT_CENTS: usize = 1;
const IDX_INCOME_THRESHOLD_CENTS: usize = 2;
const IDX_MAX_AUTO_PAYOUT_CENTS: usize = 3;
// IDX_MAX_PAY_STUB_AGE_SECS = 4 (not needed in contract logic)

/// Decode one u64 public input from the 32-byte BE field element buffer.
fn decode_input(data: &[u8], index: usize) -> Result<u64, ContractError> {
    let start = index * 32 + 24; // skip 24 leading zero bytes
    let end = start + 8;
    if end > data.len() {
        return Err(ContractError::BadPublicInputs(format!(
            "input index {} out of bounds (buf len {})",
            index,
            data.len()
        )));
    }
    let arr: [u8; 8] = data[start..end].try_into().map_err(|_| {
        ContractError::BadPublicInputs("slice to array conversion failed".to_string())
    })?;
    Ok(u64::from_be_bytes(arr))
}

// ── Instantiate ───────────────────────────────────────────────────────────────

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    let admin = match msg.admin {
        Some(a) => deps.api.addr_validate(&a)?,
        None => info.sender.clone(),
    };
    let verifier = deps.api.addr_validate(&msg.verifier_contract)?;

    CONFIG.save(
        deps.storage,
        &Config {
            admin: admin.clone(),
            verifier_contract: verifier.clone(),
            app_id: msg.app_id.clone(),
            income_threshold_cents: msg.income_threshold_cents,
            max_auto_payout: msg.max_auto_payout,
        },
    )?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("admin", admin)
        .add_attribute("verifier_contract", verifier)
        .add_attribute("app_id", msg.app_id))
}

// ── Execute ───────────────────────────────────────────────────────────────────

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::SubmitClaim {
            wallet_address,
            claim_amount,
            claim_id,
            proof,
            public_inputs,
        } => execute_submit_claim(
            deps,
            env,
            wallet_address,
            claim_amount,
            claim_id,
            proof,
            public_inputs,
        ),
        ExecuteMsg::Withdraw { amount, to } => execute_withdraw(deps, env, info, amount, to),
        ExecuteMsg::UpdateConfig {
            income_threshold_cents,
            max_auto_payout,
            verifier_contract,
            app_id,
        } => execute_update_config(
            deps,
            info,
            income_threshold_cents,
            max_auto_payout,
            verifier_contract,
            app_id,
        ),
    }
}

// ── SubmitClaim ───────────────────────────────────────────────────────────────

fn execute_submit_claim(
    deps: DepsMut,
    env: Env,
    wallet_address: String,
    claim_amount: Uint128,
    claim_id: String,
    proof: Binary,
    public_inputs: Binary,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // ── Guard: no duplicate claims ────────────────────────────────────────────
    if CLAIMS.has(deps.storage, &claim_id) {
        return Err(ContractError::DuplicateClaim { id: claim_id });
    }

    // ── Guard: claim within ceiling ───────────────────────────────────────────
    if claim_amount > config.max_auto_payout {
        return Err(ContractError::ClaimExceedsCeiling {
            amount: claim_amount,
            ceiling: config.max_auto_payout,
        });
    }

    // ── Decode public inputs ──────────────────────────────────────────────────
    let pi = public_inputs.as_slice();
    let pi_claim_amount_cents = decode_input(pi, IDX_CLAIM_AMOUNT_CENTS)?;
    let pi_income_threshold = decode_input(pi, IDX_INCOME_THRESHOLD_CENTS)?;
    let pi_max_payout_cents = decode_input(pi, IDX_MAX_AUTO_PAYOUT_CENTS)?;
    let _pi_check_date = decode_input(pi, IDX_CHECK_DATE_EPOCH)?;

    // ── Cross-check: proof parameters must match contract config ──────────────
    // This prevents a proof generated for a different threshold/ceiling being
    // replayed against this contract.
    if pi_income_threshold != config.income_threshold_cents {
        return Err(ContractError::PublicInputMismatch {
            field: "income_threshold_cents".to_string(),
            expected: config.income_threshold_cents.to_string(),
            got: pi_income_threshold.to_string(),
        });
    }

    let config_max_cents = config.max_auto_payout.u128() as u64;
    if pi_max_payout_cents != config_max_cents {
        return Err(ContractError::PublicInputMismatch {
            field: "max_auto_payout_cents".to_string(),
            expected: config_max_cents.to_string(),
            got: pi_max_payout_cents.to_string(),
        });
    }

    // Cross-check: claim_amount_cents in proof must match what was requested.
    // (1 uUXION ≈ 0.01 cents — claim_amount is in uUXION, circuit uses cents)
    // claim_amount_cents is what the circuit committed to; we trust that.
    // The actual payout uses claim_amount (uUXION) from the message, but only
    // if it's ≤ the proof's ceiling — already guarded above.
    // We verify pi_claim_amount_cents matches claim_amount (converting uUXION→cents).
    // Conversion: 1 XION = 1_000_000 uUXION = 100 cents  →  1 uUXION = 0.0001 cents
    // So cents = uUXION / 10_000
    let claimed_cents = claim_amount.u128() as u64 / 10_000;
    if pi_claim_amount_cents != claimed_cents {
        return Err(ContractError::PublicInputMismatch {
            field: "claim_amount_cents".to_string(),
            expected: claimed_cents.to_string(),
            got: pi_claim_amount_cents.to_string(),
        });
    }

    // ── Verify proof via generic verifier (inter-contract query) ──────────────
    let verify_query = VerifierQueryMsg::VerifyProof {
        app_id: config.app_id.clone(),
        proof,
        public_inputs,
    };
    let verify_resp: VerifyResponse = deps.querier.query(&QueryRequest::Wasm(
        WasmQuery::Smart {
            contract_addr: config.verifier_contract.to_string(),
            msg: to_json_binary(&verify_query)?,
        },
    ))?;

    let timestamp = env.block.time.seconds();
    let recipient = deps.api.addr_validate(&wallet_address)?;

    if !verify_resp.valid {
        // Store rejected claim for audit trail.
        save_claim(
            deps,
            &claim_id,
            &wallet_address,
            claim_amount,
            ClaimStatus::Rejected,
            timestamp,
            Some("Proof rejected by verifier".to_string()),
        )?;
        return Err(ContractError::ProofInvalid {});
    }

    // ── Proof valid — record and pay out ──────────────────────────────────────
    save_claim(
        deps,
        &claim_id,
        &wallet_address,
        claim_amount,
        ClaimStatus::Approved,
        timestamp,
        None,
    )?;

    let payout = BankMsg::Send {
        to_address: recipient.to_string(),
        amount: vec![Coin {
            denom: "uxion".to_string(),
            amount: claim_amount,
        }],
    };

    Ok(Response::new()
        .add_message(payout)
        .add_attribute("action", "claim_approved")
        .add_attribute("claim_id", claim_id)
        .add_attribute("wallet", wallet_address)
        .add_attribute("amount", claim_amount)
        .add_attribute("proving_system", verify_resp.proving_system)
        .add_attribute("app_id", config.app_id))
}

// ── Withdraw ──────────────────────────────────────────────────────────────────

fn execute_withdraw(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    amount: Uint128,
    to: Option<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized {});
    }

    let recipient = to
        .as_deref()
        .map(|a| deps.api.addr_validate(a))
        .transpose()?
        .unwrap_or(config.admin);

    // Sanity-check balance (chain will reject anyway, but gives a clear error).
    let balance = deps
        .querier
        .query_balance(&env.contract.address, "uxion")?;
    if balance.amount < amount {
        return Err(ContractError::InsufficientFunds {});
    }

    Ok(Response::new()
        .add_message(BankMsg::Send {
            to_address: recipient.to_string(),
            amount: vec![Coin { denom: "uxion".to_string(), amount }],
        })
        .add_attribute("action", "withdraw")
        .add_attribute("to", recipient)
        .add_attribute("amount", amount))
}

// ── UpdateConfig ──────────────────────────────────────────────────────────────

fn execute_update_config(
    deps: DepsMut,
    info: MessageInfo,
    income_threshold_cents: Option<u64>,
    max_auto_payout: Option<Uint128>,
    verifier_contract: Option<String>,
    app_id: Option<String>,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized {});
    }

    if let Some(t) = income_threshold_cents { config.income_threshold_cents = t; }
    if let Some(p) = max_auto_payout { config.max_auto_payout = p; }
    if let Some(v) = verifier_contract {
        config.verifier_contract = deps.api.addr_validate(&v)?;
    }
    if let Some(id) = app_id { config.app_id = id; }

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new().add_attribute("action", "update_config"))
}

// ── Query ─────────────────────────────────────────────────────────────────────

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetClaim { id } => to_json_binary(&query_get_claim(deps, id)?),
        QueryMsg::ListClaims { wallet, start_after, limit } => {
            to_json_binary(&query_list_claims(deps, wallet, start_after, limit)?)
        }
        QueryMsg::GetConfig {} => to_json_binary(&query_config(deps)?),
    }
}

fn query_get_claim(deps: Deps, id: String) -> StdResult<ClaimResponse> {
    let c = CLAIMS.load(deps.storage, &id)?;
    Ok(claim_to_response(c))
}

fn query_list_claims(
    deps: Deps,
    wallet: String,
    start_after: Option<String>,
    limit: Option<u32>,
) -> StdResult<ListClaimsResponse> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
    let ids = WALLET_CLAIMS
        .may_load(deps.storage, &wallet)?
        .unwrap_or_default();

    // Use start_after for cursor-based pagination over the stored id list.
    let skip = start_after
        .as_deref()
        .and_then(|sa| ids.iter().position(|id| id == sa).map(|p| p + 1))
        .unwrap_or(0);

    let claims = ids
        .iter()
        .skip(skip)
        .take(limit)
        .filter_map(|id| CLAIMS.load(deps.storage, id).ok())
        .map(claim_to_response)
        .collect();

    Ok(ListClaimsResponse { claims })
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let c = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        admin: c.admin.to_string(),
        verifier_contract: c.verifier_contract.to_string(),
        app_id: c.app_id,
        income_threshold_cents: c.income_threshold_cents,
        max_auto_payout: c.max_auto_payout,
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn save_claim(
    deps: DepsMut,
    claim_id: &str,
    wallet_address: &str,
    amount: Uint128,
    status: ClaimStatus,
    timestamp: u64,
    rejection_reason: Option<String>,
) -> Result<(), ContractError> {
    let claim = Claim {
        id: claim_id.to_string(),
        wallet_address: wallet_address.to_string(),
        amount,
        status,
        timestamp,
        rejection_reason,
    };
    CLAIMS.save(deps.storage, claim_id, &claim)?;

    let mut ids = WALLET_CLAIMS
        .may_load(deps.storage, wallet_address)?
        .unwrap_or_default();
    if !ids.contains(&claim_id.to_string()) {
        ids.push(claim_id.to_string());
        WALLET_CLAIMS.save(deps.storage, wallet_address, &ids)?;
    }
    Ok(())
}

fn claim_to_response(c: Claim) -> ClaimResponse {
    ClaimResponse {
        id: c.id,
        wallet_address: c.wallet_address,
        amount: c.amount,
        status: c.status,
        timestamp: c.timestamp,
        rejection_reason: c.rejection_reason,
    }
}
