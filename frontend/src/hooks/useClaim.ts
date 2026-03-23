'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { submitClaim, getClaimStatus, type ClaimResponse } from '../lib/api';

type ClaimState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'polling'; claimId: string; status: ClaimResponse | null }
  | { phase: 'done'; result: ClaimResponse }
  | { phase: 'error'; message: string };

export function useClaim() {
  const [state, setState] = useState<ClaimState>({ phase: 'idle' });
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Auto-stop polling when done
  useEffect(() => {
    if (state.phase === 'done' || state.phase === 'error') {
      stopPolling();
    }
  }, [state.phase, stopPolling]);

  const submit = useCallback(
    async (walletAddress: string, claimAmountDollars: number, claimReason: string) => {
      setState({ phase: 'submitting' });
      try {
        const { claimId } = await submitClaim({ walletAddress, claimAmountDollars, claimReason });
        setState({ phase: 'polling', claimId, status: null });

        // Poll every 3 seconds
        pollRef.current = setInterval(async () => {
          try {
            const status = await getClaimStatus(claimId);
            setState({ phase: 'polling', claimId, status });

            // Stop polling on terminal states
            if (['approved', 'rejected', 'error'].includes(status.status)) {
              stopPolling();
              setState({ phase: 'done', result: status });
            }
          } catch {
            // keep polling on transient errors
          }
        }, 3000);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setState({ phase: 'error', message });
      }
    },
    [stopPolling],
  );

  const checkStatus = useCallback(async (claimId: string) => {
    try {
      const status = await getClaimStatus(claimId);
      setState({ phase: 'done', result: status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState({ phase: 'error', message });
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setState({ phase: 'idle' });
  }, [stopPolling]);

  return { state, submit, checkStatus, reset };
}
