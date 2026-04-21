use cosmwasm_std::Uint128;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] cosmwasm_std::StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Duplicate claim: {id}")]
    DuplicateClaim { id: String },

    #[error("Claim amount {amount} exceeds ceiling {ceiling}")]
    ClaimExceedsCeiling { amount: Uint128, ceiling: Uint128 },

    #[error("Proof invalid or rejected by verifier")]
    ProofInvalid {},

    #[error("Public inputs malformed: {0}")]
    BadPublicInputs(String),

    #[error("Public input mismatch — {field}: expected {expected}, got {got}")]
    PublicInputMismatch { field: String, expected: String, got: String },

    #[error("Insufficient contract balance for payout")]
    InsufficientFunds {},
}
