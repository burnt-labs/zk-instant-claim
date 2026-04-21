use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] cosmwasm_std::StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("App already exists: {id}")]
    AppAlreadyExists { id: String },

    #[error("App not found: {id}")]
    AppNotFound { id: String },

    #[error("App is disabled: {id}")]
    AppDisabled { id: String },

    #[error("Proof rejected by verifier: {0}")]
    ProofInvalid(String),

    #[error("Verifier call failed: {0}")]
    VerifierError(String),

    #[error("Handler execution failed: {0}")]
    HandlerError(String),
}
