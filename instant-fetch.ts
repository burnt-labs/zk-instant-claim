import { ReclaimClient } from '@reclaimprotocol/zk-fetch';
import { verifyProof, transformForOnchain, Proof } from '@reclaimprotocol/js-sdk';
import dotenv from 'dotenv';

dotenv.config();

const EMPLOYEE_UUID = 'c3dd05c3-86aa-43e9-8f2d-c8832f5c5ae8';
const GUSTO_URL = `https://api.gusto-demo.com/v1/employees/${EMPLOYEE_UUID}/pay_stubs`;

export async function generateIncomeProof(bearerToken: string) {
    const client = new ReclaimClient(
        process.env.RECLAIM_APP_ID!,
        process.env.RECLAIM_APP_SECRET!,
        true
    );
    const proof = await client.zkFetch(
        GUSTO_URL,

        // publicOptions — visible in the proof, verifier can see these
        {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'X-Gusto-API-Version': '2025-11-15',
            },
        },

        // privateOptions — hidden from verifier
        {
            headers: {
                'authorization': `Bearer ${bearerToken}`, // never revealed
            },
            // Match confirms the response is a real Gusto pay stub response
            // and that gross_pay is a non-zero number
            responseMatches: [
                {
                    type: 'regex',
                    value: '"gross_pay":"(?<grossPay>[1-9][0-9]*\\.[0-9]+)"',
                },
                {
                    type: 'regex',
                    value: '"check_date":"(?<checkDate>[0-9]{4}-[0-9]{2}-[0-9]{2})"',
                },
            ],
            // Redact gross_pay from the proof output
            // The responseMatch above confirms it EXISTS and is non-zero
            // but the actual value is stripped
            responseRedactions: [
                {
                    regex: '"gross_pay":"(?<grossPay>[1-9][0-9]*\\.[0-9]+)"',
                },
            ],
        },

        3,     // retries
        5000   // retryInterval ms
    );

    return proof;
}

export async function verifyAndExtract(proof: Proof) {
    // Step 1: Verify the Reclaim attestation signatures
    const isValid = await verifyProof(proof);
    if (!isValid) throw new Error('Reclaim proof verification failed');

    // Step 2: Extract the public parameters
    const context = JSON.parse(proof.extractedParameterValues.data);
    console.log('Extracted parameters from proof context:', context);
    const { grossPay, checkDate } = context.extractedParameters;

    // Step 3: Transform for on-chain submission if needed
    const onchainProof = transformForOnchain(proof);

    return {
        grossPay: parseFloat(grossPay),   // feed into Noir circuit
        checkDate,                         // feed into Noir circuit
        onchainProof,                      // submit to Xion alongside Noir proof
    };
}

generateIncomeProof(process.env.GUSTO_BEARER_TOKEN!)
    .then(proof => {
        console.log('Generated proof:', proof);
        if (!proof) throw new Error('Failed to generate proof');
        return verifyAndExtract(proof);
    })
    .then(({ grossPay, checkDate, onchainProof }) => {
        console.log('Verified proof. Extracted gross pay:', grossPay, 'Check date:', checkDate);
        console.log('Transformed on-chain proof:', onchainProof);
    })
    .catch(err => {
        console.error('Error generating or verifying proof:', err);
    });