'use client';

import { useEffect, useState } from 'react';
import { getClaimStatus, type ClaimResponse } from '../../../lib/api';
import { ProofProgress } from '../../../components/ProofProgress';
import { Loader2, ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const XION_EXPLORER_BASE = 'https://explorer.xion-testnet-2.burnt.com/xion-testnet-2/tx';

export default function ClaimPage({ params }: { params: { id: string } }) {
  const [claim, setClaim] = useState<ClaimResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const data = await getClaimStatus(params.id);
        setClaim(data);
        setLoading(false);
        if (['approved', 'rejected', 'error'].includes(data.status)) {
          clearInterval(interval);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        setError(message);
        setLoading(false);
      }
    };

    fetchStatus();
    interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [params.id]);

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-12">
      <div className="max-w-md mx-auto">
        <Link
          href="/"
          className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm mb-8 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to claims
        </Link>

        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
          <h1 className="text-base font-semibold text-white mb-1">Claim Status</h1>
          <p className="font-mono text-xs text-gray-500 mb-6 break-all">{params.id}</p>

          {loading && !claim && (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          )}

          {error && <div className="text-sm text-red-400">{error}</div>}

          {claim && (
            <div className="space-y-6">
              <ProofProgress status={claim.status} />

              <div className="rounded-lg bg-gray-800/50 border border-gray-700 divide-y divide-gray-700/50 text-sm">
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span
                    className={`font-medium capitalize ${
                      claim.status === 'approved'
                        ? 'text-emerald-400'
                        : claim.status === 'rejected'
                          ? 'text-red-400'
                          : claim.status === 'error'
                            ? 'text-red-400'
                            : 'text-yellow-400'
                    }`}
                  >
                    {claim.status}
                  </span>
                </div>

                <div className="px-4 py-3 flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="text-white">${claim.claimAmountDollars.toLocaleString()}</span>
                </div>

                <div className="px-4 py-3">
                  <span className="text-gray-500 block mb-1">Wallet</span>
                  <span className="font-mono text-xs text-gray-300 break-all">
                    {claim.walletAddress}
                  </span>
                </div>

                {claim.txHash && (
                  <div className="px-4 py-3">
                    <span className="text-gray-500 block mb-1">Transaction</span>
                    <a
                      href={`${XION_EXPLORER_BASE}/${claim.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300 break-all"
                    >
                      {claim.txHash}
                      <ExternalLink className="w-3 h-3 flex-shrink-0 ml-1" />
                    </a>
                  </div>
                )}

                {claim.error && (
                  <div className="px-4 py-3">
                    <span className="text-gray-500 block mb-1">Error</span>
                    <span className="text-xs text-red-400">{claim.error}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
