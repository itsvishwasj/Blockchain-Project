import {
  ShieldCheck,
  FileText,
  Vote,
  ArrowRight,
  ArrowLeft,
  Boxes,
  Check,
} from 'lucide-react';
import { useState } from 'react';

export function RoleSelection({ onSelect, onBack }) {
  const [hovered, setHovered] = useState(null);

  const roles = [
    {
      id: 'admin',
      label: 'Admin',
      icon: ShieldCheck,
      description: 'Full election control — configure elections, approve candidates, manage Merkle tree, and open voting.',
      permissions: ['Election Configuration', 'Candidate Approval', 'Merkle Root Generation', 'Open Blockchain Voting'],
      color: 'cyan',
    },
    {
      id: 'candidate',
      label: 'Candidate',
      icon: FileText,
      description: 'Submit and attest your manifesto with cryptographic hashing and policy stance vectors.',
      permissions: ['Submit Manifesto', 'Real-time Keccak-256 Hash', 'Policy Stance Vectors', 'Content Attestation'],
      color: 'indigo',
    },
    {
      id: 'voter',
      label: 'Voter',
      icon: Vote,
      description: 'Anonymous voting with identity commitments, AI policy matching, and Groth16 zero-knowledge proofs.',
      permissions: ['Whitelist Login + OTP', 'Poseidon Identity Commitment', 'AI Policy Matcher', 'Anonymous ZK Voting'],
      color: 'emerald',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-zinc-950 text-zinc-200">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Top bar */}
      <nav className="relative z-10 mx-auto max-w-6xl w-full px-4 sm:px-6 h-16 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30">
            <Boxes className="h-4 w-4 text-cyan-400" />
          </div>
          <span className="text-sm font-bold text-zinc-100">Tri-Modular E-Voting</span>
        </div>
      </nav>

      {/* Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 mb-2">Choose Your Role</h1>
            <p className="text-sm text-zinc-400">Select how you want to participate in the e-voting system.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roles.map(role => {
              const Icon = role.icon;
              const isHovered = hovered === role.id;
              const colorMap = {
                cyan: { border: 'border-cyan-500/30', glow: 'glow-cyan', icon: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', btn: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25' },
                indigo: { border: 'border-indigo-500/30', glow: '', icon: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', btn: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25' },
                emerald: { border: 'border-emerald-500/30', glow: 'glow-emerald', icon: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', btn: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25' },
              };
              const c = colorMap[role.color];
              return (
                <div
                  key={role.id}
                  onMouseEnter={() => setHovered(role.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={`card-hover rounded-xl border ${isHovered ? c.border : 'border-zinc-800'} bg-zinc-900/80 backdrop-blur p-5 flex flex-col ${isHovered ? c.glow : ''} transition-all`}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${c.icon} mb-4`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100 mb-2">{role.label}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mb-4 flex-1">{role.description}</p>
                  <ul className="space-y-1.5 mb-5">
                    {role.permissions.map(p => (
                      <li key={p} className="flex items-center gap-2 text-xs text-zinc-500">
                        <Check className="h-3 w-3 text-zinc-600" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => onSelect(role.id)}
                    className={`flex items-center gap-2 rounded-lg border ${c.btn} px-4 py-2.5 text-sm font-medium transition-all w-full justify-center`}
                  >
                    Continue as {role.label}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
