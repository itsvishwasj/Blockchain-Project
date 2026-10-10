import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import api from "../../lib/api";
import { randomFieldElement } from "../../lib/zkProof";
import { KeyRound, ShieldCheck, CheckCircle2, ArrowRight, Cpu, Lock, AlertCircle } from "lucide-react";

async function computeIdentityCommitment(voterSecret) {
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const hash = poseidon([voterSecret]);
  return poseidon.F.toObject(hash).toString();
}

export default function RegisterForElection() {
  const router = useRouter();
  const [electionId, setElectionId] = useState("19");
  const [status, setStatus] = useState("");
  const [approved, setApproved] = useState(false);
  const [commitmentPreview, setCommitmentPreview] = useState("");

  useEffect(() => {
    if (router.query.election) {
      setElectionId(String(router.query.election));
      return;
    }

    if (typeof window !== "undefined") {
      const savedId = localStorage.getItem("activeElectionId");
      if (savedId) {
        setElectionId(savedId);
      }
    }
  }, [router.query.election]);

  async function handleRegister() {
    setStatus("Generating your private voting secret locally in browser memory...");
    let voterSecret = localStorage.getItem("voterSecret");
    if (!voterSecret) {
      voterSecret = randomFieldElement();
      localStorage.setItem("voterSecret", voterSecret);
    }

    setStatus("Computing Poseidon identity commitment fingerprint...");
    let identityCommitment;
    try {
      identityCommitment = await computeIdentityCommitment(voterSecret);
      setCommitmentPreview(identityCommitment);
    } catch (err) {
      setStatus("Error computing Poseidon hash: " + err.message);
      return;
    }

    setStatus("Verifying whitelist eligibility against database...");
    try {
      const { data } = await api.post(`/voter/elections/${electionId}/register`, { identityCommitment });
      if (data.status === "APPROVED") {
        setApproved(true);
        setStatus("✅ Registered & approved! You can now cast your anonymous vote.");
      } else {
        setStatus("Registration submitted — waiting for admin to lock voter root.");
      }
    } catch (err) {
      setStatus("❌ " + (err.response?.data?.error || "Registration failed"));
    }
  }

  async function checkStatus() {
    try {
      const { data } = await api.get(`/voter/elections/${electionId}/registration-status`);
      if (data.status === "APPROVED") setApproved(true);
      setStatus("Your registration status: " + data.status);
    } catch (err) {
      setStatus(err.response?.data?.error || "Could not check status");
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6fc] px-4 sm:px-8 py-12 flex items-center justify-center font-sans">
      <div className="max-w-xl w-full bg-white rounded-3xl p-8 space-y-6 shadow-xs border border-slate-100">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 mb-1">
            <KeyRound className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Voter Identity Commitment Engine
          </h1>
          <p className="text-xs text-slate-500">
            Generate your Poseidon zero-knowledge identity fingerprint without exposing your private secret.
          </p>
        </div>

        {/* Cryptographic Explainer Banner */}
        <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 text-xs text-slate-700 leading-relaxed space-y-1">
          <p className="font-bold flex items-center gap-1.5 text-blue-900">
            <Cpu className="w-4 h-4 text-blue-600" /> How Poseidon Identity Commitments Work
          </p>
          <p className="text-[11px] text-slate-600">
            Your browser creates a 256-bit random field secret locally. A <strong className="text-slate-900">Poseidon hash</strong> is derived in memory. Only the fingerprint is published to the Merkle tree leaf — your private secret never leaves your device.
          </p>
        </div>

        {/* Form Inputs */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Election Window ID</label>
            <input
              value={electionId}
              onChange={(e) => setElectionId(e.target.value)}
              placeholder="e.g. 19"
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {commitmentPreview && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs space-y-1">
              <span className="text-slate-500 text-[10px] block font-sans">Local Poseidon Commitment Leaf:</span>
              <p className="text-blue-700 font-bold break-all">{commitmentPreview}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={handleRegister}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl py-3 transition-all shadow-xs flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" /> Generate Secret &amp; Register
            </button>
            <button
              onClick={checkStatus}
              className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 font-extrabold text-xs rounded-xl py-3 transition-all"
            >
              Check My Eligibility
            </button>
          </div>
        </div>

        {/* Status Notification Box */}
        {status && (
          <div className={`p-4 rounded-2xl text-xs font-mono whitespace-pre-line ${
            approved 
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800" 
              : "bg-amber-50 border border-amber-200 text-amber-800"
          }`}>
            {status}
          </div>
        )}

        {/* Approved Next Steps */}
        {approved && (
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 pt-4">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">Next Steps:</span>
            <div className="flex flex-col gap-2">
              <a 
                href={`/voter/survey?election=${electionId}`}
                className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-200 hover:border-blue-300 text-xs font-bold text-blue-700 transition-all shadow-xs"
              >
                <span>1. Take AI Candidate Stance Vector Survey (Optional)</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <a 
                href={`/voter/vote?election=${electionId}`}
                className="flex items-center justify-between p-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-xs transition-all"
              >
                <span>2. Cast Anonymous Vote via In-Browser ZK Prover</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}