import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { fetchPayStubProof } from '../services/zkfetch';
import { generateNoirProof, buildCircuitInputs } from '../services/noir-prover';
import { submitClaimOnChain, queryClaimStatus, queryClaimsByWallet } from '../services/xion-client';
import { config } from '../config';

const router = Router();

// In-memory claim store (for demo — maps claim_id to status for fast reads)
interface ClaimEntry {
  id: string;
  status: 'processing' | 'submitted' | 'approved' | 'rejected' | 'error';
  txHash?: string;
  error?: string;
  walletAddress: string;
  claimAmountCents: number;
  createdAt: number;
}

const claimStore = new Map<string, ClaimEntry>();

const ClaimRequestSchema = z.object({
  walletAddress: z.string().startsWith('xion1').min(10),
  claimAmountDollars: z.number().positive().max(5000),
  claimReason: z.enum([
    'house_fire',
    'flood_damage',
    'theft',
    'vehicle_accident',
    'medical_emergency',
    'other',
  ]),
  employeeUuid: z.string().uuid().optional(),
});

// POST /api/claim — submit a new insurance claim
router.post('/', async (req: Request, res: Response) => {
  const parseResult = ClaimRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request', details: parseResult.error.issues });
  }

  const { walletAddress, claimAmountDollars, claimReason, employeeUuid } = parseResult.data;
  const claimAmountCents = Math.round(claimAmountDollars * 100);
  const claimId = uuidv4();

  // Reject immediately if over ceiling
  if (claimAmountCents > config.claim.maxAutoPayoutCents) {
    return res.status(400).json({
      error: `Claim amount $${claimAmountDollars} exceeds auto-payout ceiling of $${config.claim.maxAutoPayoutCents / 100}`,
    });
  }

  // Store initial state
  claimStore.set(claimId, {
    id: claimId,
    status: 'processing',
    walletAddress,
    claimAmountCents,
    createdAt: Date.now(),
  });

  // Return claim ID immediately — processing is async
  res.status(202).json({
    claimId,
    status: 'processing',
    message: 'Claim submitted. Use GET /api/claim/:id to check status.',
  });

  // Process async (don't await)
  processClaim(claimId, walletAddress, claimAmountCents, claimReason, employeeUuid).catch(
    (err: Error) => {
      console.error(`Claim ${claimId} processing error:`, err);
      const entry = claimStore.get(claimId);
      if (entry) {
        claimStore.set(claimId, { ...entry, status: 'error', error: err.message });
      }
    },
  );
});

async function processClaim(
  claimId: string,
  walletAddress: string,
  claimAmountCents: number,
  _claimReason: string,
  employeeUuid?: string,
) {
  const update = (updates: Partial<ClaimEntry>) => {
    const current = claimStore.get(claimId)!;
    claimStore.set(claimId, { ...current, ...updates });
  };

  // Step 1: Fetch pay stub proof via zkFetch
  console.log(`[${claimId}] Step 1: Fetching pay stub proof via zkFetch...`);
  const payStubProof = await fetchPayStubProof(employeeUuid);
  console.log(
    `[${claimId}] Step 1 done: grossPay=${payStubProof.grossPayCents} cents, checkDate=${payStubProof.checkDateEpoch}`,
  );

  // Step 2: Generate Noir proof
  console.log(`[${claimId}] Step 2: Generating Noir proof...`);
  const circuitInputs = buildCircuitInputs(
    payStubProof.grossPayCents,
    payStubProof.checkDateEpoch,
    claimAmountCents,
  );
  const noirProof = await generateNoirProof(circuitInputs);
  console.log(`[${claimId}] Step 2 done: proof generated (${noirProof.proofHex.length / 2} bytes)`);

  // Step 3: Submit to Xion
  console.log(`[${claimId}] Step 3: Submitting to Xion...`);

  // Convert cents to uxion: 1 cent = 10,000 uxion for demo purposes
  // (actual UXION/USD rate varies — adjust for testnet demo)
  const claimAmountUxion = (claimAmountCents * 10000).toString();

  const onChainResult = await submitClaimOnChain({
    noirProofHex: noirProof.proofHex,
    publicInputs: noirProof.publicInputs,
    reclaimProofJson: payStubProof.proofJson,
    walletAddress,
    claimAmountUxion,
    claimId,
  });

  update({ status: 'submitted', txHash: onChainResult.txHash });
  console.log(`[${claimId}] Step 3 done: tx=${onChainResult.txHash}`);
}

// GET /api/claim/wallet/:address — list claims by wallet (must be before /:id)
router.get('/wallet/:address', async (req: Request, res: Response) => {
  const { address } = req.params;

  // Local claims
  const localClaims = Array.from(claimStore.values())
    .filter((c) => c.walletAddress === address)
    .map((c) => ({
      id: c.id,
      status: c.status,
      txHash: c.txHash,
      walletAddress: c.walletAddress,
      claimAmountDollars: c.claimAmountCents / 100,
      error: c.error,
      createdAt: c.createdAt,
    }));

  // Try to enrich with on-chain data
  let onChainClaims = null;
  try {
    onChainClaims = await queryClaimsByWallet(address);
  } catch {
    // Silently skip on-chain query if contract not deployed
  }

  return res.json({ claims: localClaims, onChain: onChainClaims });
});

// GET /api/claim/:id — get claim status
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const localState = claimStore.get(id);

  if (!localState) {
    return res.status(404).json({ error: 'Claim not found' });
  }

  // If submitted, also fetch on-chain state for confirmed status
  let onChainStatus = null;
  if (localState.status === 'submitted' || localState.status === 'approved') {
    try {
      onChainStatus = await queryClaimStatus(id);
    } catch {
      // On-chain query failed — return local state only
    }
  }

  return res.json({
    id,
    status: onChainStatus?.status ?? localState.status,
    txHash: localState.txHash,
    walletAddress: localState.walletAddress,
    claimAmountDollars: localState.claimAmountCents / 100,
    onChain: onChainStatus,
    error: localState.error,
    createdAt: localState.createdAt,
  });
});

export default router;
