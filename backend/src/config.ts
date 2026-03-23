import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  gusto: {
    baseUrl: process.env.GUSTO_API_BASE_URL!,
    apiVersion: process.env.GUSTO_API_VERSION!,
    bearerToken: process.env.GUSTO_BEARER_TOKEN!,
    employeeUuid: process.env.GUSTO_EMPLOYEE_UUID!,
  },

  reclaim: {
    appId: process.env.RECLAIM_APP_ID!,
    appSecret: process.env.RECLAIM_APP_SECRET!,
  },

  xion: {
    rpcUrl: process.env.XION_RPC_URL!,
    chainId: process.env.XION_CHAIN_ID!,
    backendMnemonic: process.env.XION_BACKEND_MNEMONIC!,
    contractAddress: process.env.ZKPAY_CONTRACT_ADDRESS!,
  },

  claim: {
    incomeThresholdCents: parseInt(process.env.INCOME_THRESHOLD_CENTS || '300000'),
    maxAutoPayoutCents: parseInt(process.env.MAX_AUTO_PAYOUT_CENTS || '500000'),
    maxPayStubAgeDays: parseInt(process.env.MAX_PAY_STUB_AGE_DAYS || '90'),
  },

  circuit: {
    nargoWorkspacePath: process.env.NARGO_WORKSPACE_PATH || '../circuit',
    vkeyName: process.env.VKEY_NAME || 'zkpay_income_verifier',
  },

  useMockProof: process.env.USE_MOCK_PROOF === 'true',
} as const;
