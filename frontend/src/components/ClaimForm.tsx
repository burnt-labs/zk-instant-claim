'use client';

import { useState, useEffect, useRef } from 'react';
import { useClaim } from '../hooks/useClaim';
import { ProofProgress } from './ProofProgress';
import { Shield, Zap, CheckCircle, XCircle, ExternalLink, Loader2, Cpu, Lock } from 'lucide-react';

const CLAIM_REASONS = [
  { value: 'house_fire', label: '🔥 House Fire' },
  { value: 'flood_damage', label: '🌊 Flood Damage' },
  { value: 'theft', label: '🔓 Theft' },
  { value: 'vehicle_accident', label: '🚗 Vehicle Accident' },
  { value: 'medical_emergency', label: '🏥 Medical Emergency' },
  { value: 'other', label: 'Other' },
];

const XION_EXPLORER_BASE = 'https://explorer.burnt.com/xion-testnet-1/tx';

function AnimatedAmount({ amount }: { amount: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = amount;
    const duration = 1200;
    const start = Date.now();
    const tick = () => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
      else setDisplay(target);
    };
    requestAnimationFrame(tick);
  }, [amount]);
  return <>${display.toLocaleString()}</>;
}

export function ClaimForm() {
  const { state, submit, checkStatus, reset } = useClaim();
  const [walletAddress, setWalletAddress] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [claimReason, setClaimReason] = useState('house_fire');
  const [lookupId, setLookupId] = useState('');
  const submitTimeRef = useRef<number>(0);
  const [settledIn, setSettledIn] = useState<number | null>(null);

  // Track total settlement time
  useEffect(() => {
    if (state.phase === 'submitting') {
      submitTimeRef.current = Date.now();
      setSettledIn(null);
    }
    if (state.phase === 'done' && state.result.status === 'approved') {
      setSettledIn(Math.round((Date.now() - submitTimeRef.current) / 1000));
    }
  }, [state.phase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(claimAmount);
    if (isNaN(amount) || amount <= 0 || amount > 5000) return;
    await submit(walletAddress, amount, claimReason);
  };

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (state.phase === 'idle') {
    return (
      <div className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Wallet Address */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Xion Wallet Address
            </label>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="xion1..."
              required
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition font-mono text-sm"
            />
          </div>

          {/* Claim Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Claim Amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
              <input
                type="number"
                value={claimAmount}
                onChange={(e) => setClaimAmount(e.target.value)}
                placeholder="0.00"
                min="1"
                max="5000"
                step="0.01"
                required
                className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Max $5,000 · Auto-approved with ZK income proof</p>
          </div>

          {/* Claim Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Claim Reason</label>
            <select
              value={claimReason}
              onChange={(e) => setClaimReason(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            >
              {CLAIM_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Privacy Notice */}
          <div className="rounded-lg bg-blue-950/40 border border-blue-800/40 px-4 py-3 text-xs text-blue-300">
            <div className="flex items-start gap-2">
              <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
              <p>
                Income verified via <strong>zero-knowledge proof</strong> — your salary is never
                revealed to the insurer or stored on-chain.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={!walletAddress || !claimAmount}
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-blue-900/30"
          >
            <Zap className="w-4 h-4" />
            Submit Instant Claim
          </button>
        </form>

        {/* Lookup */}
        <div className="pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 mb-2">Already have a claim ID?</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="Claim ID (UUID)"
              className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition"
            />
            <button
              onClick={() => lookupId && checkStatus(lookupId)}
              className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs transition"
            >
              Check
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Submitting ────────────────────────────────────────────────────────────
  if (state.phase === 'submitting') {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
        <div className="text-sm text-gray-400">Initiating claim...</div>
      </div>
    );
  }

  // ── Polling ───────────────────────────────────────────────────────────────
  if (state.phase === 'polling') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">Claim ID</div>
            <div className="font-mono text-xs text-gray-400">{state.claimId.slice(0, 18)}…</div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-yellow-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing
          </div>
        </div>
        <ProofProgress status={state.status?.status ?? 'processing'} />
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (state.phase === 'done') {
    const { result } = state;
    const approved = result.status === 'approved' || result.status === 'submitted';

    if (approved) {
      return (
        <div className="space-y-4">
          {/* Main approval card */}
          <div className="rounded-xl bg-gradient-to-b from-emerald-950/60 to-emerald-950/20 border border-emerald-700/50 p-5 text-center">
            <div className="relative inline-block mb-3">
              <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
              <CheckCircle className="relative w-14 h-14 text-emerald-400" />
            </div>
            <div className="text-emerald-300 font-semibold text-sm mb-1 uppercase tracking-wider">
              Claim Approved
            </div>
            <div className="text-4xl font-bold text-white tabular-nums mb-1">
              <AnimatedAmount amount={result.claimAmountDollars} />
            </div>
            <div className="text-sm text-gray-400 mb-3">paid to your wallet</div>

            {settledIn && (
              <div className="inline-flex items-center gap-1.5 bg-emerald-900/40 border border-emerald-700/40 rounded-full px-3 py-1 text-xs text-emerald-400">
                <Zap className="w-3 h-3" />
                Settled in {settledIn} seconds
              </div>
            )}
          </div>

          {/* ZK verification badge */}
          <div className="rounded-lg bg-gray-800/60 border border-gray-700/60 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-gray-300">ZK Proof Verified On-chain</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-gray-500">Circuit</span>
              <span className="text-gray-300 font-mono">Noir UltraHonk</span>
              <span className="text-gray-500">Verifier</span>
              <span className="text-gray-300 font-mono">Xion Native Module</span>
              <span className="text-gray-500">Scheme</span>
              <span className="text-gray-300 font-mono">Barretenberg</span>
              <span className="text-gray-500">Privacy</span>
              <span className="text-emerald-400 font-mono">Salary hidden ✓</span>
            </div>
          </div>

          {/* TX Hash */}
          {result.txHash && (
            <div className="rounded-lg bg-gray-800/50 border border-gray-700 px-4 py-3">
              <div className="text-xs text-gray-500 mb-1">Transaction</div>
              <a
                href={`${XION_EXPLORER_BASE}/${result.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-mono text-xs text-blue-400 hover:text-blue-300 break-all transition"
              >
                {result.txHash.slice(0, 20)}…{result.txHash.slice(-8)}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          )}

          <button
            onClick={reset}
            className="w-full py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition"
          >
            Submit Another Claim
          </button>
        </div>
      );
    }

    // Rejected
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-red-950/40 border border-red-700/40 p-5 text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <div className="text-lg font-bold text-red-300 mb-1">Claim Rejected</div>
          <div className="text-xs text-gray-400">
            {result.onChain?.status ?? result.error ?? 'Proof verification failed'}
          </div>
        </div>
        {result.txHash && (
          <div className="rounded-lg bg-gray-800/50 border border-gray-700 px-4 py-3">
            <div className="text-xs text-gray-500 mb-1">Transaction</div>
            <a
              href={`${XION_EXPLORER_BASE}/${result.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-mono text-xs text-blue-400 hover:text-blue-300 break-all"
            >
              {result.txHash.slice(0, 20)}…{result.txHash.slice(-8)}
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          </div>
        )}
        <button
          onClick={reset}
          className="w-full py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (state.phase === 'error') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-red-950/50 border border-red-700/50 px-4 py-3">
          <div className="text-sm font-medium text-red-300 mb-1">Error</div>
          <div className="text-xs text-red-400">{state.message}</div>
        </div>
        <button
          onClick={reset}
          className="w-full py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  return null;
}
