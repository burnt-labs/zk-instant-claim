import { ClaimForm } from '../components/ClaimForm';
import { Shield, Zap, Lock, Cpu, ArrowRight } from 'lucide-react';

const TECH_BADGES = [
  { label: 'Noir', sub: 'ZK Circuit' },
  { label: 'Barretenberg', sub: 'UltraHonk' },
  { label: 'Xion', sub: 'Native Verifier' },
  { label: 'CosmWasm', sub: 'Smart Contract' },
  { label: 'Reclaim', sub: 'zkTLS' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: Shield,
    title: 'zkTLS Payroll Fetch',
    desc: 'Reclaim Protocol fetches your Gusto pay stub via TLS. Your raw salary never leaves your device.',
    tag: 'Privacy',
  },
  {
    step: '02',
    icon: Cpu,
    title: 'Noir Circuit Proof',
    desc: 'A custom Noir circuit proves income ≥ threshold and pay stub is within 90 days — without revealing the number.',
    tag: 'ZK',
  },
  {
    step: '03',
    icon: Zap,
    title: 'On-chain Verification',
    desc: "The CosmWasm contract calls Xion's native barretenberg module to verify the UltraHonk proof.",
    tag: 'Xion-native',
  },
  {
    step: '04',
    icon: ArrowRight,
    title: 'Instant Payout',
    desc: 'Proof verified → BankMsg::Send fires automatically. UXION hits your wallet in seconds.',
    tag: 'Automatic',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-white text-lg tracking-tight">ZKPay</span>
            <span className="text-xs text-gray-500 mt-0.5">by Burnt Labs</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              xion-local-testnet-1
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-14 pb-10 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-blue-950/60 border border-blue-800/50 rounded-full px-4 py-1.5 text-xs text-blue-300 mb-6">
            <Zap className="w-3 h-3" />
            World&apos;s first ZK-verified instant insurance settlement
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight tracking-tight">
            Insurance Claims That Pay{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              In Seconds
            </span>
          </h1>
          <p className="text-gray-400 text-lg mb-8">
            No paperwork. No HR calls. No 30-day wait. Your income is verified by a zero-knowledge
            proof — your salary is never revealed.
          </p>

          {/* Trust stats */}
          <div className="flex items-center justify-center gap-8 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">&lt; 60s</div>
              <div className="text-xs text-gray-500 mt-0.5">Settlement time</div>
            </div>
            <div className="w-px h-8 bg-gray-800" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">$0</div>
              <div className="text-xs text-gray-500 mt-0.5">Salary exposed</div>
            </div>
            <div className="w-px h-8 bg-gray-800" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">100%</div>
              <div className="text-xs text-gray-500 mt-0.5">On-chain verified</div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech badges */}
      <div className="flex items-center justify-center gap-2 flex-wrap px-6 pb-10">
        {TECH_BADGES.map((b) => (
          <div
            key={b.label}
            className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-full px-3 py-1.5"
          >
            <span className="text-xs font-semibold text-white">{b.label}</span>
            <span className="text-xs text-gray-500">{b.sub}</span>
          </div>
        ))}
      </div>

      {/* Claim Form */}
      <section className="px-6 pb-16 flex-1">
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Submit Instant Claim</h2>
              <div className="flex items-center gap-1 text-xs text-emerald-400">
                <Lock className="w-3 h-3" />
                ZK Protected
              </div>
            </div>
            <ClaimForm />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-14 bg-gray-900/40 border-t border-gray-800">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
              Under the hood
            </div>
            <h3 className="text-xl font-bold text-white">How ZKPay Works</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {HOW_IT_WORKS.map((item) => (
              <div
                key={item.step}
                className="rounded-xl bg-gray-900 border border-gray-800 p-5 hover:border-gray-700 transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-700 tabular-nums">{item.step}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-950/60 border border-blue-800/40 text-blue-400">
                    {item.tag}
                  </span>
                </div>
                <item.icon className="w-5 h-5 text-blue-400 mb-2" />
                <div className="text-sm font-semibold text-white mb-1">{item.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Xion callout */}
      <section className="px-6 py-10 border-t border-gray-800">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
            <Cpu className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <p className="text-sm text-gray-400 text-left">
              <span className="text-white font-medium">Xion-native ZK verification: </span>
              The CosmWasm contract calls{' '}
              <code className="text-blue-400 bg-gray-800 px-1 rounded text-xs">
                /xion.zk.v1.Query/ProofVerifyUltraHonk
              </code>{' '}
              — the chain&apos;s built-in barretenberg module — to verify proofs without a separate verifier contract.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
