const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export interface SubmitClaimRequest {
  walletAddress: string;
  claimAmountDollars: number;
  claimReason: string;
  employeeUuid?: string;
}

export interface ClaimResponse {
  id: string;
  status: 'processing' | 'submitted' | 'approved' | 'rejected' | 'error';
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

export async function submitClaim(
  data: SubmitClaimRequest,
): Promise<{ claimId: string; status: string }> {
  const res = await fetch(`${API_BASE}/api/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to submit claim');
  }
  return res.json();
}

export async function getClaimStatus(claimId: string): Promise<ClaimResponse> {
  const res = await fetch(`${API_BASE}/api/claim/${claimId}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch claim status');
  }
  return res.json();
}
