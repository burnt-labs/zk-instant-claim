export type ClaimStatus = 'processing' | 'submitted' | 'approved' | 'rejected' | 'error';

export type ClaimReason =
  | 'house_fire'
  | 'flood_damage'
  | 'theft'
  | 'vehicle_accident'
  | 'medical_emergency'
  | 'other';

export interface SubmitClaimRequest {
  walletAddress: string;
  claimAmountDollars: number;
  claimReason: ClaimReason;
  employeeUuid?: string;
}

export interface SubmitClaimResponse {
  claimId: string;
  status: 'processing';
  message: string;
}

export interface ClaimStatusResponse {
  id: string;
  status: ClaimStatus;
  txHash?: string;
  walletAddress: string;
  claimAmountDollars: number;
  onChain?: {
    status: string;
    claim_amount: string;
    timestamp: number;
  };
  error?: string;
  createdAt: number;
}

// Circuit public inputs (order matters — matches Noir circuit signature)
export interface CircuitPublicInputs {
  checkDateEpoch: number;
  claimAmountCents: number;
  incomeThresholdCents: number;
  maxAutoPayoutCents: number;
  maxPayStubAgeSecs: number;
}

export interface ProofResult {
  proofHex: string;
  publicInputs: string[];
}
