import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import api from "../../lib/api";
import { randomFieldElement } from "../../lib/zkProof";

async function computeIdentityCommitment(voterSecret) {
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const hash = poseidon([voterSecret]);
  return poseidon.F.toObject(hash).toString();
}

export default function RegisterForElection() {
  const router = useRouter();
  const [electionId, setElectionId] = useState("1");
  const [status, setStatus] = useState("");
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (router.query.election) {
      setElectionId(String(router.query.election));
    }
  }, [router.query.election]);

  async function handleRegister() {
    setStatus("Generating your private voting secret in this browser...");
    let voterSecret = localStorage.getItem("voterSecret");
    if (!voterSecret) {
      voterSecret = randomFieldElement();
      localStorage.setItem("voterSecret", voterSecret);
    }
    setStatus("Computing your identity commitment...");
    let identityCommitment;
    try {
      identityCommitment = await computeIdentityCommitment(voterSecret);
    } catch (err) {
      setStatus("Error: " + err.message);
      return;
    }
    setStatus("Checking eligibility...");
    try {
      const { data } = await api.post(`/voter/elections/${electionId}/register`, { identityCommitment });
      if (data.status === "APPROVED") {
        setApproved(true);
        setStatus("Registered and approved! You can now cast your vote.");
      } else {
        setStatus("Registration submitted — waiting for admin approval.");
      }
    } catch (err) {
      setStatus("Error: " + (err.response?.data?.error || "Registration failed"));
    }
  }

  async function checkStatus() {
    try {
      const { data } = await api.get(`/voter/elections/${electionId}/registration-status`);
      if (data.status === "APPROVED") setApproved(true);
      setStatus("Your status: " + data.status);
    } catch (err) {
      setStatus(err.response?.data?.error || "Could not check status");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="max-w-lg mx-auto">
        <div className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
          <h1 className="text-2xl font-bold text-white mb-4">Register to Vote</h1>
          <div className="p-4 bg-cyan-400/10 border border-cyan-400/20 rounded-lg mb-6">
            <p className="text-sm text-cyan-200">
              <strong className="text-cyan-100">How this works:</strong> Your browser
              generates a private secret that stays on this device. Only a
              mathematical fingerprint gets sent to the server — never the secret
              itself. This keeps your vote anonymous.
            </p>
          </div>
          <label className="text-sm text-slate-300 block mb-4">
            Election ID
            <input
              value={electionId}
              onChange={(e) => setElectionId(e.target.value)}
              className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </label>
          <div className="flex gap-3">
            <button
              onClick={handleRegister}
              className="flex-1 bg-cyan-400 text-slate-950 font-semibold rounded-lg py-2.5 hover:bg-cyan-300 transition-colors"
            >
              Register for this Election
            </button>
            <button
              onClick={checkStatus}
              className="flex-1 bg-slate-800 border border-slate-700 text-white font-medium rounded-lg py-2.5 hover:bg-slate-700 transition-colors"
            >
              Check My Status
            </button>
          </div>
          {status && (
            <p className={`mt-4 p-3 rounded-lg text-sm ${approved ? "bg-emerald-400/10 border border-emerald-400/20 text-emerald-200" : "bg-amber-400/10 border border-amber-400/20 text-amber-200"}`}>
              {status}
            </p>
          )}
          {approved && (
            <div className="mt-4 text-sm text-slate-300">
              <p className="mb-2">Ready to vote? Go to:</p>
              <a href={"/voter/survey?election=" + electionId} className="block text-cyan-400 hover:underline mb-1">
                Take the candidate matching survey first (optional)
              </a>
              <a href={"/voter/vote?election=" + electionId} className="block text-cyan-400 hover:underline">
                Cast your anonymous vote
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}