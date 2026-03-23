'use client';

import { CheckCircle, Circle, Loader2 } from 'lucide-react';

interface Step {
  id: string;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  {
    id: 'fetch',
    label: 'Fetching Payroll Data',
    description: 'Connecting to Gusto via zkTLS — your salary stays private',
  },
  {
    id: 'prove',
    label: 'Generating ZK Proof',
    description: 'Proving income eligibility without revealing your salary',
  },
  {
    id: 'submit',
    label: 'Submitting to Xion',
    description: 'Sending verified proof to the blockchain',
  },
  {
    id: 'payout',
    label: 'Processing Payout',
    description: 'Contract verified — initiating stablecoin transfer',
  },
];

type StepStatus = 'pending' | 'active' | 'done' | 'error';

function inferStepStatus(appStatus: string, stepIndex: number): StepStatus {
  const statusToProgress: Record<string, number> = {
    processing: 1,
    submitted: 3,
    approved: 4,
    rejected: 4,
    error: -1,
  };

  const progress = statusToProgress[appStatus] ?? 0;
  if (progress < 0) return stepIndex === 0 ? 'error' : 'pending';
  if (stepIndex < progress) return 'done';
  if (stepIndex === progress) return 'active';
  return 'pending';
}

export function ProofProgress({ status }: { status: string }) {
  return (
    <div className="space-y-4">
      {STEPS.map((step, i) => {
        const stepStatus = inferStepStatus(status, i);
        return (
          <div key={step.id} className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-0.5">
              {stepStatus === 'done' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
              {stepStatus === 'active' && (
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              )}
              {stepStatus === 'pending' && <Circle className="w-5 h-5 text-gray-600" />}
              {stepStatus === 'error' && <Circle className="w-5 h-5 text-red-400" />}
            </div>
            <div>
              <div
                className={`text-sm font-medium ${
                  stepStatus === 'done'
                    ? 'text-emerald-400'
                    : stepStatus === 'active'
                      ? 'text-white'
                      : stepStatus === 'error'
                        ? 'text-red-400'
                        : 'text-gray-500'
                }`}
              >
                {step.label}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{step.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
