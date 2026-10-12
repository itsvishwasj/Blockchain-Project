import { ShieldCheck, FileText, Vote as VoteIcon, Sparkles, BarChart3 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export function LandingPage({ onSelectPortal }) {
  return (
    <div className="min-h-screen bg-[#f3f6fc] text-slate-800 flex flex-col font-sans relative overflow-hidden">
      {/* Top Header matching reference image: Logo left, System Live right */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-lg shadow-sm">
            +
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">
            TriVote
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            System Live
          </div>
        </div>
      </header>

      {/* Hero Section matching reference image */}
      <main className="flex-1 max-w-5xl mx-auto px-6 pt-8 pb-16 flex flex-col items-center justify-center text-center">
        {/* Top pill tag */}
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200/60 px-4 py-1.5 mb-8 text-xs font-medium text-blue-700 shadow-xs">
          <Sparkles className="h-3.5 w-3.5 text-blue-600" />
          Real-time Zero-Knowledge E-Voting System
        </div>

        {/* Main Heading with clean underlined accent */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-6 max-w-3xl">
          Smart voting for<br />
          <span className="relative inline-block text-blue-600 underline decoration-blue-400/60 decoration-wavy underline-offset-8">
            smarter elections
          </span>
        </h1>

        {/* Subheading */}
        <p className="text-base sm:text-lg text-slate-500 max-w-2xl leading-relaxed mb-12">
          Voters generate Poseidon identity commitments, verify policy stance similarity, and cast anonymous ZK votes on-chain without revealing identity.
        </p>

        {/* Portals Cards Grid matching reference image cards (4 Portals: Admin, Candidate, Voter, Results) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl">
          {/* Admin Portal Card */}
          <div
            onClick={() => onSelectPortal('admin')}
            className="group cursor-pointer bg-white rounded-3xl p-7 border border-slate-100 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_30px_-4px_rgba(37,99,235,0.12)] transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1"
          >
            <div className="h-14 w-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-5 text-indigo-600 group-hover:scale-105 transition-transform">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Admin Dashboard</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-6 flex-1">
              Election control — lock Poseidon Merkle roots, attest candidate manifestos, and open blockchain voting.
            </p>
            <span className="text-sm font-bold text-blue-600 group-hover:text-blue-700 flex items-center gap-1 transition-colors">
              Open Dashboard →
            </span>
          </div>

          {/* Candidate Portal Card */}
          <div
            onClick={() => onSelectPortal('candidate')}
            className="group cursor-pointer bg-white rounded-3xl p-7 border border-slate-100 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_30px_-4px_rgba(37,99,235,0.12)] transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1"
          >
            <div className="h-14 w-14 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center mb-5 text-purple-600 group-hover:scale-105 transition-transform">
              <FileText className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Candidate Portal</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-6 flex-1">
              Register candidates, generate real-time Keccak-256 manifesto hashes, and configure 6-axis policy stance vectors.
            </p>
            <span className="text-sm font-bold text-blue-600 group-hover:text-blue-700 flex items-center gap-1 transition-colors">
              Open Portal →
            </span>
          </div>

          {/* Voter Gateway Card */}
          <a
            href="/voter"
            className="group cursor-pointer bg-white rounded-3xl p-7 border border-slate-100 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_30px_-4px_rgba(37,99,235,0.12)] transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1 block"
          >
            <div className="h-14 w-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-5 text-emerald-600 group-hover:scale-105 transition-transform">
              <VoteIcon className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Voter Gateway</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-6 flex-1">
              Whitelist authentication, identity commitments, AI policy matching, and Groth16 zero-knowledge voting.
            </p>
            <span className="text-sm font-bold text-emerald-600 group-hover:text-emerald-700 flex items-center gap-1 transition-colors">
              Open Gateway →
            </span>
          </a>

          {/* Results Portal Card (4th Portal - No login required) */}
          <a
            href="/results"
            className="group cursor-pointer bg-white rounded-3xl p-7 border border-slate-100 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_30px_-4px_rgba(245,158,11,0.18)] transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1 block"
          >
            <div className="h-14 w-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-5 text-amber-600 group-hover:scale-105 transition-transform">
              <BarChart3 className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Public Results</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-6 flex-1">
              Live election tallies, turnouts, winner certificates, and certified cryptographic audit receipts for past and ongoing elections.
            </p>
            <span className="text-sm font-bold text-amber-600 group-hover:text-amber-700 flex items-center gap-1 transition-colors">
              View Results →
            </span>
          </a>
        </div>
      </main>

      {/* Light Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-6 border-t border-slate-200/60 text-center text-xs text-slate-400">
        Tri-Modular E-Voting Architecture · Poseidon ZK Proof · Groth16 Verifier
      </footer>
    </div>
  );
}
