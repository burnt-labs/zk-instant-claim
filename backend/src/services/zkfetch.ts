import { config } from '../config';

export interface PayStubProofResult {
  grossPayCents: number;
  checkDateEpoch: number;
  rawProof: unknown;
  proofJson: string;
}

// Mock payroll data — used when USE_MOCK_PROOF=true
// grossPay = $10,000 (above $3,000 threshold), checkDate = 2026-02-25 (within 90 days)
const MOCK_PAY_STUB: PayStubProofResult = {
  grossPayCents: 1_000_000, // $10,000
  checkDateEpoch: 1771977600, // 2026-02-25T00:00:00Z
  rawProof: { mock: true },
  proofJson: JSON.stringify({ mock: true }),
};

export async function fetchPayStubProof(
  _employeeUuid?: string,
): Promise<PayStubProofResult> {
  if (config.useMockProof) {
    console.log('[zkfetch] USE_MOCK_PROOF=true — returning mock pay stub data');
    return MOCK_PAY_STUB;
  }

  // Real Reclaim/zkFetch path (lazy import to avoid loading heavy SDK in mock mode)
  const { ReclaimClient } = await import('@reclaimprotocol/zk-fetch');
  const { verifyProof } = await import('@reclaimprotocol/js-sdk');

  const employeeUuid = _employeeUuid ?? config.gusto.employeeUuid;

  const client = new ReclaimClient(
    config.reclaim.appId,
    config.reclaim.appSecret,
    true, // debug mode
  );

  const url = `${config.gusto.baseUrl}/v1/employees/${employeeUuid}/pay_stubs`;

  const proof = await client.zkFetch(
    url,
    {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'X-Gusto-API-Version': config.gusto.apiVersion,
      },
    },
    {
      headers: {
        'authorization': `Bearer ${config.gusto.bearerToken}`,
      },
      responseMatches: [
        {
          type: 'regex' as const,
          value: '"gross_pay":"(?<grossPay>[1-9][0-9]*\\.[0-9]+)"',
        },
        {
          type: 'regex' as const,
          value: '"check_date":"(?<checkDate>[0-9]{4}-[0-9]{2}-[0-9]{2})"',
        },
      ],
      responseRedactions: [
        {
          regex: '"gross_pay":"(?<grossPay>[1-9][0-9]*\\.[0-9]+)"',
        },
      ],
    },
    3,
    5000,
  );

  if (!proof) {
    throw new Error('zkFetch returned null proof');
  }

  const isValid = await verifyProof(proof as any);
  if (!isValid) {
    throw new Error('Reclaim proof verification failed — attestation signatures invalid');
  }

  const proofAny = proof as any;
  let grossPay: string | undefined;
  let checkDate: string | undefined;

  if (proofAny.extractedParameterValues) {
    try {
      const data = JSON.parse(proofAny.extractedParameterValues.data || '{}');
      grossPay = data.extractedParameters?.grossPay;
      checkDate = data.extractedParameters?.checkDate;
    } catch { /* fall through */ }
    if (!grossPay) {
      grossPay = proofAny.extractedParameterValues?.grossPay;
      checkDate = proofAny.extractedParameterValues?.checkDate;
    }
  }

  if (!grossPay && proofAny.claimInfo?.context) {
    try {
      const context = JSON.parse(proofAny.claimInfo.context);
      grossPay = context.extractedParameters?.grossPay;
      checkDate = context.extractedParameters?.checkDate;
    } catch { /* fall through */ }
  }

  if (!grossPay || !checkDate) {
    console.error('Proof object:', JSON.stringify(proof, null, 2));
    throw new Error('grossPay or checkDate not found in proof');
  }

  const grossPayCents = Math.round(parseFloat(grossPay) * 100);
  const checkDateEpoch = Math.floor(new Date(checkDate).getTime() / 1000);

  return {
    grossPayCents,
    checkDateEpoch,
    rawProof: proof,
    proofJson: JSON.stringify(proof),
  };
}
