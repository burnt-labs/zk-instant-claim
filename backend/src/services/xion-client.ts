import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import { config } from '../config';

let _client: SigningCosmWasmClient | null = null;
let _queryClient: SigningCosmWasmClient | null = null;

async function getSigningClient(): Promise<SigningCosmWasmClient> {
  if (_client) return _client;

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    config.xion.backendMnemonic,
    { prefix: 'xion' },
  );

  _client = await SigningCosmWasmClient.connectWithSigner(
    config.xion.rpcUrl,
    wallet,
    { gasPrice: GasPrice.fromString('0.025uxion') },
  );

  return _client;
}

async function getQueryClient(): Promise<SigningCosmWasmClient> {
  if (_queryClient) return _queryClient;
  _queryClient = await getSigningClient();
  return _queryClient;
}

export interface SubmitClaimOnChainParams {
  noirProofHex: string;
  publicInputs: string[];
  reclaimProofJson: string;
  walletAddress: string;
  claimAmountUxion: string; // amount in uxion (micro)
  claimId: string;
}

export interface OnChainSubmitResult {
  txHash: string;
  height: number;
  gasUsed: number;
}

export async function submitClaimOnChain(
  params: SubmitClaimOnChainParams,
): Promise<OnChainSubmitResult> {
  const client = await getSigningClient();

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    config.xion.backendMnemonic,
    { prefix: 'xion' },
  );
  const [account] = await wallet.getAccounts();

  const msg = {
    submit_claim: {
      noir_proof: params.noirProofHex,
      public_inputs: params.publicInputs,
      reclaim_proof_json: params.reclaimProofJson,
      wallet_address: params.walletAddress,
      claim_amount: params.claimAmountUxion,
      claim_id: params.claimId,
    },
  };

  const result = await client.execute(
    account.address,
    config.xion.contractAddress,
    msg,
    'auto',
    `ZKPay claim ${params.claimId}`,
  );

  return {
    txHash: result.transactionHash,
    height: result.height,
    gasUsed: Number(result.gasUsed),
  };
}

export async function queryClaimStatus(claimId: string) {
  const client = await getQueryClient();
  const result = await client.queryContractSmart(config.xion.contractAddress, {
    get_claim: { id: claimId },
  });
  return result;
}

export async function queryClaimsByWallet(walletAddress: string) {
  const client = await getQueryClient();
  const result = await client.queryContractSmart(config.xion.contractAddress, {
    list_claims: { wallet: walletAddress, limit: 20 },
  });
  return result;
}
