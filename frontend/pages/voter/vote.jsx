import { useState } from "react";
import api from "../../lib/api";
import { generateVoteProof, randomFieldElement } from "../../lib/zkProof";

export default function VotePage() {
  const [electionId, setElectionId] = useState(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("election") || "1"
      : "1"
  );
  const [candidateChoice, setCandidateChoice] = useState(0);
  const [status, setStatus] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [metrics, setMetrics] = useState(null);

  async function handleVote() {
    const timings = {};
    setMetrics(null);
    setReceipt(null);

    setStatus("Checking registration status...");
    const voterSecret = localStorage.getItem("voterSecret");
    if (!voterSecret) {
      setStatus("❌ No voting secret found — go to the Register page first.");
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

      setStatus("Fetching your Merkle proof from server...");
      const t1 = Date.now();
      const { data: proofData } = await api.get(
        `/voter/elections/${electionId}/merkle-proof`
      );
      timings.merkleProofFetchMs = Date.now() - t1;

      setStatus("⏳ Generating zero-knowledge proof in your browser...\n(This takes a few seconds — the math is running locally on your device)");

      // ---- DEBUG START ----
      console.log("DEBUG", { voterSecret, pathElements: proofData.pathElements, pathIndices: proofData.pathIndices, merkleRoot: proofData.merkleRoot });

      const { buildPoseidon } = await import("circomlibjs");
      const poseidon = await buildPoseidon();
      const computedCommitment = poseidon.F.toObject(poseidon([voterSecret])).toString();
      console.log("COMPUTED_COMMITMENT", computedCommitment);
      // ---- DEBUG END ----

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

      setStatus(`✅ Proof generated in ${(timings.zkProofGenerationMs / 1000).toFixed(1)}s\nSubmitting to blockchain...`);

      const t3 = Date.now();
      const { data } = await api.post(
        `/voter/elections/${electionId}/cast-vote`,
        { pA, pB, pC, pubSignals }
      );
      timings.blockchainConfirmMs = Date.now() - t3;

      localStorage.setItem(`voteBlinding_${electionId}`, voteBlinding);

      setMetrics(timings);
      setReceipt(data);
      setStatus("✅ Vote cast successfully!");
    } catch (err) {
      setStatus("❌ " + (err.response?.data?.error || err.message || "Vote failed"));
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
          <h1 className="text-2xl font-bold text-white mb-4">Cast Your Vote</h1>

          <div className="p-4 bg-cyan-400/10 border border-cyan-400/20 rounded-lg mb-6">
            <p className="text-sm text-cyan-200 m-0">
              Your vote is completely anonymous. A zero-knowledge proof is generated
              in your browser — no one can link your vote to your identity.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <label className="text-sm text-slate-300">
              Election ID
              <input
                value={electionId}
                onChange={e => setElectionId(e.target.value)}
                className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
              />
            </label>
            <label className="text-sm text-slate-300">
              Candidate Number (0 = first candidate, 1 = second, etc.)
              <input
                type="number"
                min="0"
                value={candidateChoice}
                onChange={e => setCandidateChoice(Number(e.target.value))}
                className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
              />
            </label>
            <button
              onClick={handleVote}
              className="bg-cyan-400 text-slate-950 font-semibold rounded-lg py-2.5 hover:bg-cyan-300 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.4)]"
            >
              Submit Anonymous Vote
            </button>
          </div>

          {status && (
            <p
              className={`mt-4 p-3 rounded-lg text-sm whitespace-pre-line ${
                status.startsWith("❌")
                  ? "bg-red-500/10 border border-red-500/30 text-red-300"
                  : "bg-slate-800 border border-slate-700 text-slate-200"
              }`}
            >
              {status}
            </p>
          )}

          {/* PERFORMANCE METRICS */}
          {metrics && (
            <div className="mt-4 p-4 bg-emerald-400/10 border border-emerald-400/20 rounded-lg">
              <h3 className="text-white font-semibold mb-3">⚡ Performance Metrics</h3>
              <table className="w-full text-sm text-slate-200 border-collapse">
                <tbody>
                  <tr className="border-b border-emerald-400/20">
                    <td className="py-1.5">Merkle proof fetch</td>
                    <td className="py-1.5 text-right font-bold">
                      {metrics.merkleProofFetchMs}ms
                    </td>
                  </tr>
                  <tr className="border-b border-emerald-400/20">
                    <td className="py-1.5">ZK proof generation (in browser)</td>
                    <td className="py-1.5 text-right font-bold">
                      {(metrics.zkProofGenerationMs / 1000).toFixed(2)}s
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5">Blockchain confirmation</td>
                    <td className="py-1.5 text-right font-bold">
                      {(metrics.blockchainConfirmMs / 1000).toFixed(2)}s
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-slate-400 mt-2">
                ZK proof runs entirely in your browser — the server never sees your secret.
              </p>
            </div>
          )}

          {/* RECEIPT */}
          {receipt && (
            <div className="mt-4 p-4 bg-amber-400/10 border border-amber-400/20 rounded-lg">
              <h3 className="text-white font-semibold mb-2">🧾 Your Vote Receipt</h3>
              <p className="text-xs text-slate-300 mb-2">
                Save these to verify your vote was counted later.
              </p>
              <p className="text-xs text-slate-300 break-all my-1">
                <strong className="text-slate-100">Transaction hash:</strong><br />{receipt.txHash}
              </p>
              <p className="text-xs text-slate-300 break-all my-1">
                <strong className="text-slate-100">Nullifier (your anonymous receipt):</strong><br />{receipt.nullifierHash}
              </p>
              {receipt.txTime && (
                <p className="text-xs text-slate-300 my-1">
                  <strong className="text-slate-100">Blockchain confirmation time:</strong> {receipt.txTime}s
                </p>
              )}
              <p className="text-[11px] text-slate-500 mt-2">
                The nullifier proves your vote was counted without revealing
                your identity or your choice.
              </p>
            </div>
          )}

          <div className="mt-6 text-sm text-cyan-400 flex flex-wrap gap-x-2">
            <a href={`/election/${electionId}`} className="hover:underline">← View candidates</a>
            <span className="text-slate-600">|</span>
            <a href={`/voter/survey?election=${electionId}`} className="hover:underline">Take matching survey</a>
            <span className="text-slate-600">|</span>
            <a href={`/results/${electionId}`} className="hover:underline">View results</a>
          </div>
        </div>
      </div>
    </div>
  );
}