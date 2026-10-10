import { useState, useEffect } from "react";
import api from "../../lib/api";
import { generateVoteProof, randomFieldElement } from "../../lib/zkProof";
import { 
  Vote, ShieldCheck, Cpu, CheckCircle2, AlertCircle, Sparkles, 
  ExternalLink, FileCheck, Layers, Clock, Award
} from "lucide-react";

export default function VotePage() {
  const [electionId, setElectionId] = useState("19");
  const [candidateChoice, setCandidateChoice] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const queryElectionId = new URLSearchParams(window.location.search).get("election");
    const savedElectionId = localStorage.getItem("activeElectionId");
    const nextElectionId = queryElectionId || savedElectionId || "19";

    setElectionId(nextElectionId);
  }, []);
  const [candidatesList, setCandidatesList] = useState([]);
  const [status, setStatus] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [timingMetrics, setTimingMetrics] = useState(null);

  useEffect(() => {
    loadCandidates();
  }, [electionId]);

  async function loadCandidates() {
    try {
      const { data } = await api.get(`/public/elections/${electionId}/candidates`);
      if (data.candidates && data.candidates.length) {
        setCandidatesList(data.candidates);
      }
    } catch (e) {
      console.log("Candidate load note:", e.message);
    }
  }

  async function handleVote() {
    const timings = {};
    setReceipt(null);
    setTimingMetrics(null);

    setStatus("Verifying voter registration status...");
    const voterSecret = localStorage.getItem("voterSecret");
    if (!voterSecret) {
      setStatus("❌ No voting secret found on this device — please complete registration first.");
      return;
    }

    try {
      const { data: statusData } = await api.get(
        `/voter/elections/${electionId}/registration-status`
      );
      if (statusData.status !== "APPROVED") {
        setStatus(`❌ Cannot vote — registration status: "${statusData.status}"`);
        return;
      }

      setStatus("Fetching Poseidon Merkle inclusion proof from server...");
      const t1 = Date.now();
      const { data: proofData } = await api.get(
        `/voter/elections/${electionId}/merkle-proof`
      );
      timings.merkleProofFetchMs = Date.now() - t1;

      setStatus("⏳ Generating Groth16 zk-SNARK proof locally in browser...\n(Executing circom WASM & Poseidon hash in client memory)");

      const t2 = Date.now();
      const voteBlinding = randomFieldElement();
      const { pA, pB, pC, pubSignals } = await generateVoteProof({
        voterSecret,
        pathElements: proofData.pathElements,
        pathIndices: proofData.pathIndices,
        candidateChoice,
        voteBlinding,
        merkleRoot: proofData.merkleRoot,
        electionId
      });
      timings.zkProofGenerationMs = Date.now() - t2;

      setStatus(`✅ Groth16 ZK proof generated in ${(timings.zkProofGenerationMs / 1000).toFixed(2)}s!\nSubmitting transaction to Hardhat EVM...`);

      const t3 = Date.now();
      const { data } = await api.post(
        `/voter/elections/${electionId}/cast-vote`,
        { pA, pB, pC, pubSignals, metrics: timings }
      );
      const onChainTimeMs = Date.now() - t3;
      timings.blockchainConfirmMs = data.txTime ? Math.round(parseFloat(data.txTime) * 1000) : onChainTimeMs;
      timings.totalLatencyMs = timings.merkleProofFetchMs + timings.zkProofGenerationMs + timings.blockchainConfirmMs;

      localStorage.setItem(`voteBlinding_${electionId}`, voteBlinding);

      setReceipt(data);
      setTimingMetrics(timings);
      setStatus("🎉 Vote verified & cast anonymously on blockchain!");
    } catch (err) {
      setStatus("❌ " + (err.response?.data?.error || err.message || "Vote failed"));
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6fc] px-4 sm:px-8 py-10 flex items-center justify-center font-sans">
      <div className="max-w-2xl w-full space-y-6">
        
        {/* Main Voting Card */}
        <div className="bg-white p-8 rounded-3xl space-y-6 shadow-xs border border-slate-100">
          
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-blue-700 uppercase tracking-widest px-2.5 py-0.5 bg-blue-50 border border-blue-100 rounded-full flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Anonymous ZK Prover Engine
                </span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Cast Your Anonymous Ballot
              </h1>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs text-slate-600">
              <span className="font-bold">Election ID:</span>
              <input
                value={electionId}
                onChange={(e) => setElectionId(e.target.value)}
                className="w-16 bg-slate-50 border border-slate-200 text-blue-700 font-bold px-2.5 py-1 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
              />
            </div>
          </div>

          {/* Cryptographic Privacy Explainer */}
          <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 text-xs text-slate-700 leading-relaxed space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-blue-900">
              <Cpu className="w-4 h-4 text-blue-600" /> Complete Zero-Knowledge Privacy Guarantee
            </p>
            <p className="text-[11px] text-slate-600">
              Your vote choice is encrypted inside a Groth16 proof. A unique <strong className="text-slate-900">Poseidon Nullifier Hash</strong> is published on-chain to prevent double voting without disclosing your identity or ballot.
            </p>
          </div>

          {/* Candidate Choice Selector */}
          <div className="space-y-3">
            <label className="text-xs font-extrabold text-slate-700 block uppercase tracking-wider">
              Select Your Preferred Candidate:
            </label>

            <div className="space-y-2.5">
              {candidatesList.length > 0 ? (
                candidatesList.map((c, index) => (
                  <label
                    key={c.id}
                    onClick={() => setCandidateChoice(index)}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                      candidateChoice === index
                        ? "bg-blue-50/80 border-blue-500 shadow-xs text-slate-900"
                        : "bg-slate-50/60 border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="candidate"
                        checked={candidateChoice === index}
                        onChange={() => setCandidateChoice(index)}
                        className="accent-blue-600 w-4 h-4"
                      />
                      <div>
                        <p className="font-extrabold text-sm text-slate-900">{c.display_name}</p>
                        <p className="text-xs text-slate-500">{c.bio}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-blue-700 font-bold px-2.5 py-1 rounded-xl bg-white border border-slate-200">
                      Index #{index}
                    </span>
                  </label>
                ))
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                  Defaulting to Candidate Index #0. (No public candidates loaded for election #{electionId}).
                </div>
              )}
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleVote}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-2xl py-3.5 transition-all shadow-xs flex items-center justify-center gap-2"
          >
            <Vote className="w-4 h-4" /> Generate ZK Proof &amp; Cast Vote On-Chain
          </button>

          {/* Status Box */}
          {status && (
            <div className={`p-4 rounded-2xl text-xs font-mono whitespace-pre-line ${
              receipt
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-blue-50 border border-blue-200 text-blue-800"
            }`}>
              {status}
            </div>
          )}
        </div>

        {/* Cryptographic Receipt Modal / Panel */}
        {receipt && (
          <div className="bg-white p-6 rounded-3xl space-y-4 border border-emerald-200 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900">Cryptographic Vote Receipt</h3>
              </div>
              <span className="text-xs font-mono text-emerald-700 font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                VERIFIED ON-CHAIN
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-slate-500 text-[10px] block font-sans">EVM Transaction Hash:</span>
                <p className="text-blue-700 font-bold text-[11px] break-all">{receipt.txHash}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-slate-500 text-[10px] block font-sans">Poseidon Nullifier Hash (Double-Vote Prevention):</span>
                <p className="text-purple-700 font-bold text-[11px] break-all">{receipt.nullifierHash}</p>
              </div>

              {timingMetrics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px]">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <span className="text-slate-500 block text-[9px] font-sans">MERKLE FETCH</span>
                    <span className="text-blue-700 font-bold">{timingMetrics.merkleProofFetchMs}ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <span className="text-slate-500 block text-[9px] font-sans">ZK PROOF GEN</span>
                    <span className="text-indigo-700 font-bold">{(timingMetrics.zkProofGenerationMs / 1000).toFixed(2)}s</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <span className="text-slate-500 block text-[9px] font-sans">EVM CONFIRM</span>
                    <span className="text-emerald-700 font-bold">{timingMetrics.blockchainConfirmMs}ms</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-center">
                    <span className="text-slate-500 block text-[9px] font-sans">TOTAL LATENCY</span>
                    <span className="text-blue-800 font-black">{(timingMetrics.totalLatencyMs / 1000).toFixed(2)}s</span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 text-center">
              <a
                href={`/results/${electionId}`}
                className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 underline"
              >
                View Aggregate Post-Election Performance Benchmarks &amp; Tally →
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}