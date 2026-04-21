use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo,
    Order, Response, StdResult, WasmMsg,
};
use cw_storage_plus::Bound;

use crate::error::ContractError;
use crate::msg::{
    AppResponse, ExecuteMsg, HandlerExecuteMsg, InstantiateMsg, ListAppsResponse,
    QueryMsg, VerifyResponse,
};
use crate::state::{App, Config, APPS, CONFIG};
use crate::verifier::{verify_proof, ProvingSystem};

const DEFAULT_PAGE_LIMIT: u32 = 20;
const MAX_PAGE_LIMIT: u32 = 100;

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

    CONFIG.save(deps.storage, &Config { admin: admin.clone() })?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("admin", admin))
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
        ExecuteMsg::RegisterApp {
            app_id,
            vkey_name,
            proving_system,
            handler,
        } => execute_register_app(deps, env, info, app_id, vkey_name, proving_system, handler),

        ExecuteMsg::UpdateApp { app_id, handler, enabled } => {
            execute_update_app(deps, info, app_id, handler, enabled)
        }

        ExecuteMsg::RemoveApp { app_id } => execute_remove_app(deps, info, app_id),

        ExecuteMsg::SubmitProof { app_id, proof, public_inputs } => {
            execute_submit_proof(deps, info, app_id, proof, public_inputs)
        }
    }
}

// ── RegisterApp ───────────────────────────────────────────────────────────────

fn execute_register_app(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    app_id: String,
    vkey_name: String,
    proving_system: ProvingSystem,
    handler: Option<String>,
) -> Result<Response, ContractError> {
    if APPS.has(deps.storage, &app_id) {
        return Err(ContractError::AppAlreadyExists { id: app_id });
    }

    let handler_addr = handler
        .as_deref()
        .filter(|h| !h.is_empty())
        .map(|h| deps.api.addr_validate(h))
        .transpose()?;

    let app = App {
        app_id: app_id.clone(),
        owner: info.sender.clone(),
        vkey_name: vkey_name.clone(),
        proving_system: proving_system.clone(),
        handler: handler_addr.clone(),
        enabled: true,
        created_at: env.block.time.seconds(),
        proof_count: 0,
    };

    APPS.save(deps.storage, &app_id, &app)?;

    Ok(Response::new()
        .add_attribute("action", "register_app")
        .add_attribute("app_id", app_id)
        .add_attribute("owner", info.sender)
        .add_attribute("vkey_name", vkey_name)
        .add_attribute("proving_system", proving_system.as_str())
        .add_attribute("handler", handler_addr.map(|a| a.to_string()).unwrap_or_default()))
}

// ── UpdateApp ─────────────────────────────────────────────────────────────────

fn execute_update_app(
    deps: DepsMut,
    info: MessageInfo,
    app_id: String,
    handler: Option<String>,
    enabled: Option<bool>,
) -> Result<Response, ContractError> {
    let mut app = APPS
        .may_load(deps.storage, &app_id)?
        .ok_or_else(|| ContractError::AppNotFound { id: app_id.clone() })?;

    if app.owner != info.sender {
        return Err(ContractError::Unauthorized {});
    }

    if let Some(h) = handler {
        app.handler = if h.is_empty() {
            None
        } else {
            Some(deps.api.addr_validate(&h)?)
        };
    }

    if let Some(e) = enabled {
        app.enabled = e;
    }

    APPS.save(deps.storage, &app_id, &app)?;

    Ok(Response::new()
        .add_attribute("action", "update_app")
        .add_attribute("app_id", app_id))
}

// ── RemoveApp ─────────────────────────────────────────────────────────────────

fn execute_remove_app(
    deps: DepsMut,
    info: MessageInfo,
    app_id: String,
) -> Result<Response, ContractError> {
    let app = APPS
        .may_load(deps.storage, &app_id)?
        .ok_or_else(|| ContractError::AppNotFound { id: app_id.clone() })?;

    if app.owner != info.sender {
        return Err(ContractError::Unauthorized {});
    }

    APPS.remove(deps.storage, &app_id);

    Ok(Response::new()
        .add_attribute("action", "remove_app")
        .add_attribute("app_id", app_id))
}

// ── SubmitProof ───────────────────────────────────────────────────────────────

fn execute_submit_proof(
    deps: DepsMut,
    info: MessageInfo,
    app_id: String,
    proof: Binary,
    public_inputs: Binary,
) -> Result<Response, ContractError> {
    let mut app = APPS
        .may_load(deps.storage, &app_id)?
        .ok_or_else(|| ContractError::AppNotFound { id: app_id.clone() })?;

    if !app.enabled {
        return Err(ContractError::AppDisabled { id: app_id });
    }

    // ── Verify via Xion native ZK module ─────────────────────────────────────
    let valid = verify_proof(
        deps.as_ref(),
        &app.proving_system,
        proof.as_slice(),
        public_inputs.as_slice(),
        &app.vkey_name,
    )?;

    if !valid {
        return Err(ContractError::ProofInvalid(format!(
            "proof rejected by {} verifier for app {}",
            app.proving_system.as_str(),
            app_id
        )));
    }

    // ── Update proof count ────────────────────────────────────────────────────
    app.proof_count += 1;
    APPS.save(deps.storage, &app_id, &app)?;

    // ── Build response ────────────────────────────────────────────────────────
    let mut response = Response::new()
        .add_attribute("action", "proof_verified")
        .add_attribute("app_id", app_id.clone())
        .add_attribute("proving_system", app.proving_system.as_str())
        .add_attribute("submitter", info.sender.to_string())
        .add_attribute("proof_count", app.proof_count.to_string());

    // ── Call handler if registered ────────────────────────────────────────────
    if let Some(handler_addr) = app.handler {
        let handler_msg = HandlerExecuteMsg::ProofVerified {
            app_id,
            public_inputs,
            submitter: info.sender.to_string(),
        };

        let wasm_msg = WasmMsg::Execute {
            contract_addr: handler_addr.to_string(),
            msg: to_json_binary(&handler_msg)
                .map_err(|e| ContractError::HandlerError(e.to_string()))?,
            // Forward any funds the submitter attached.
            // Handlers that don't need funds should assert funds are empty.
            funds: info.funds,
        };

        response = response.add_message(wasm_msg);
    }

    Ok(response)
}

// ── Query ─────────────────────────────────────────────────────────────────────

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetApp { app_id } => to_json_binary(&query_get_app(deps, app_id)?),
        QueryMsg::ListApps { start_after, limit } => {
            to_json_binary(&query_list_apps(deps, start_after, limit)?)
        }
        QueryMsg::VerifyProof { app_id, proof, public_inputs } => {
            to_json_binary(&query_verify_proof(deps, app_id, proof, public_inputs)?)
        }
    }
}

fn query_get_app(deps: Deps, app_id: String) -> StdResult<AppResponse> {
    let app = APPS.load(deps.storage, &app_id)?;
    Ok(app_to_response(app))
}

fn query_list_apps(
    deps: Deps,
    start_after: Option<String>,
    limit: Option<u32>,
) -> StdResult<ListAppsResponse> {
    let limit = limit.unwrap_or(DEFAULT_PAGE_LIMIT).min(MAX_PAGE_LIMIT) as usize;
    let start = start_after.as_deref().map(Bound::exclusive);

    let apps: Vec<AppResponse> = APPS
        .range(deps.storage, start, None, Order::Ascending)
        .take(limit)
        .filter_map(|r| r.ok())
        .map(|(_, app)| app_to_response(app))
        .collect();

    Ok(ListAppsResponse { apps })
}

fn query_verify_proof(
    deps: Deps,
    app_id: String,
    proof: Binary,
    public_inputs: Binary,
) -> StdResult<VerifyResponse> {
    let app = APPS.load(deps.storage, &app_id)?;

    if !app.enabled {
        return Ok(VerifyResponse {
            valid: false,
            app_id,
            proving_system: app.proving_system.as_str().to_string(),
        });
    }

    let valid = verify_proof(
        deps,
        &app.proving_system,
        proof.as_slice(),
        public_inputs.as_slice(),
        &app.vkey_name,
    )
    .unwrap_or(false);

    Ok(VerifyResponse {
        valid,
        app_id,
        proving_system: app.proving_system.as_str().to_string(),
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn app_to_response(app: App) -> AppResponse {
    AppResponse {
        app_id: app.app_id,
        owner: app.owner.to_string(),
        vkey_name: app.vkey_name,
        proving_system: app.proving_system,
        handler: app.handler.map(|a| a.to_string()),
        enabled: app.enabled,
        created_at: app.created_at,
        proof_count: app.proof_count,
    }
}
