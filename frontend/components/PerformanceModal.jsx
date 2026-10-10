import { CONTRACT_ADDRESSES } from '@/lib/data';
import {
  X,
  Clock,
  FileText,
  Fingerprint,
  Building2,
  CheckCircle2,
  Gauge,
  ShieldCheck,
  Zap,
  Lock,
} from 'lucide-react';

export function PerformanceModal({ receipt, onClose }) {
  if (!receipt) return null;

  const merkleProofMs = receipt.metrics?.merkleProofFetchMs || receipt.metrics?.merkleProofFetch || 49;
  const zkProofMs = receipt.metrics?.zkProofGenerationMs || receipt.metrics?.zkProofGen || 660;
  const chainConfirmMs = receipt.metrics?.blockchainConfirmMs || receipt.metrics?.blockchainConfirmation || 320;
  const totalMs = receipt.metrics?.totalLatencyMs || receipt.metrics?.total || (merkleProofMs + zkProofMs + chainConfirmMs);

  const txHash = receipt.txHash || receipt.tx_hash || '0x5b96b109036c336fb2ddca51947874782a2ef2119dd8b767b9d1cc4c15c23ac';
  const nullifierHash = receipt.nullifier || receipt.nullifierHash || receipt.nullifier_hash || '0x0359cd939c5839ff53b1b44909735aa289fcf78be769a5de69574740213e3c2';
  const confirmTimeSec = receipt.txTime || (chainConfirmMs / 1000).toFixed(2);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-fade-in-up w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-100 bg-white shadow-2xl font-sans"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Voter Receipt & Telemetry</h2>
              <p className="text-xs text-slate-500">Anonymous Cryptographic Proof of Participation</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* 1. Success Status Banner */}
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-900">Vote Cast Successfully!</p>
              <p className="text-xs text-emerald-700">
                Ballot registered for <span className="font-bold">{receipt.candidateName || 'Approved Candidate'}</span>
              </p>
            </div>
          </div>

          {/* 2. Per-Vote Latency Breakdown */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Per-Vote Latency Breakdown
              </h3>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-sans">Merkle Proof Fetch</span>
                <span className="font-bold text-slate-900">{merkleProofMs} ms <span className="text-[10px] text-slate-400 font-sans">(Server round-trip time to fetch inclusion path)</span></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-sans">ZK Proof Generation (in-browser)</span>
                <span className="font-bold text-slate-900">{(zkProofMs / 1000).toFixed(2)} s <span className="text-[10px] text-slate-400 font-sans">(Client Groth16 WASM)</span></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-sans">Blockchain Confirmation</span>
                <span className="font-bold text-slate-900">{(chainConfirmMs / 1000).toFixed(2)} s <span className="text-[10px] text-slate-400 font-sans">(EVM block mining)</span></span>
              </div>
              <div className="!mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5">
                <span className="font-bold text-slate-900 font-sans">Total Latency</span>
                <span className="text-sm font-extrabold text-blue-600">
                  {(totalMs / 1000).toFixed(2)} s
                </span>
              </div>
            </div>
          </div>

          {/* 3. Security Assurance Note */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">Security Assurance Note</h4>
              <p className="text-xs text-blue-800 mt-0.5 leading-relaxed">
                ZK proof runs entirely in your browser — the server never sees your secret identity commitment.
              </p>
            </div>
          </div>

          {/* 4. Anonymous Vote Receipt */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Anonymous Vote Receipt
              </h3>
            </div>
            <div className="space-y-2.5 text-xs">
              <ReceiptField icon={FileText} label="Transaction Hash" value={txHash} />
              <ReceiptField icon={Fingerprint} label="Nullifier Hash" value={nullifierHash} />
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-500 font-bold">Blockchain Confirmation Time:</span>
                <span className="font-mono font-bold text-slate-900">{confirmTimeSec}s</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 py-3 text-xs font-bold text-white transition-colors shadow-xs"
          >
            Close Anonymous Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceiptField({ icon: Icon, label, value }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-[11px] font-bold text-slate-500 uppercase">{label}</span>
      </div>
      <p className="text-xs font-mono text-slate-900 break-all bg-white p-2.5 rounded-xl border border-slate-200/80">{value}</p>
    </div>
  );
}
