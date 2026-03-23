use cosmwasm_std::Uint128;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] cosmwasm_std::StdError),

    #[error("Claim amount {amount} exceeds auto-payout ceiling {ceiling}")]
    ClaimExceedsCeiling { amount: Uint128, ceiling: Uint128 },

    #[error("Duplicate claim ID: {id}")]
    DuplicateClaim { id: String },

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Invalid proof: {0}")]
    InvalidProof(String),
}
