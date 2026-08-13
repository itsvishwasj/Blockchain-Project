import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const TOPICS = [
  { key: "economy", label: "Economy" },
  { key: "environment", label: "Environment" },
  { key: "healthcare", label: "Healthcare" },
  { key: "education", label: "Education" },
  { key: "civil_rights", label: "Civil Rights" },
  { key: "security", label: "Security" }
];

function StanceBar({ value }) {
  const pct = ((value + 1) / 2) * 100;
  const color = value > 0.3 ? "#34d399" : value < -0.3 ? "#f87171" : "#fbbf24";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-800 rounded h-2">
        <div className="h-2 rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs w-9" style={{ color }}>
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}

export default function ElectionPage() {
  const router = useRouter();
  const { id } = router.query;
  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [verifyResults, setVerifyResults] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");

    axios.get(`${API_BASE}/public/elections/${id}/status`)
      .then(r => setElection(r.data))
      .catch(err => {
        setError(
          err.response?.data?.error ||
          err.message ||
          "Failed to load election. Is the backend running on port 4000?"
        );
      })
      .finally(() => setLoading(false));

    axios.get(`${API_BASE}/public/elections/${id}/candidates`)
      .then(r => setCandidates(r.data.candidates))
      .catch(err => {
        console.error("Failed to load candidates:", err.message);
      });
  }, [id]);

  async function verifyIntegrity(candidateId) {
    setVerifyResults(prev => ({ ...prev, [candidateId]: { loading: true } }));
    try {
      const res = await axios.get(`${API_BASE}/public/candidates/${candidateId}/verify-integrity`);
      setVerifyResults(prev => ({ ...prev, [candidateId]: res.data }));
    } catch (err) {
      setVerifyResults(prev => ({ ...prev, [candidateId]: { error: "Check failed" } }));
    }
  }

  if (loading)
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );

  if (error || !election)
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-md bg-slate-900 border border-red-500/30 rounded-2xl p-8 text-center">
          <h2 className="text-red-400 font-semibold text-lg mb-2">Couldn't load election #{id}</h2>
          <p className="text-slate-400 text-sm">{error || "Election not found."}</p>
          <p className="text-slate-500 text-xs mt-4">
            Double-check the election ID matches one that currently exists on your
            admin dashboard, and that the backend is running.
          </p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
          <h1 className="text-2xl font-bold text-white mb-4">{election.title}</h1>
          <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg mb-6 text-sm text-slate-300">
            <p className="m-0">Status: <strong className="text-slate-100">{election.liveStatus}</strong></p>
            <p className="m-0 mt-1">Voting closes: {new Date(election.end_time).toLocaleString()}</p>
          </div>

          <h2 className="text-lg font-semibold text-white mb-4">Candidates</h2>
          {candidates.length === 0 && (
            <p className="text-sm text-slate-400 mb-4">No approved candidates yet for this election.</p>
          )}
          <div className="flex flex-col gap-4">
            {candidates.map(c => {
              const stances = c.stance_vector
                ? (typeof c.stance_vector === "string" ? JSON.parse(c.stance_vector) : c.stance_vector)
                : null;
              const vr = verifyResults[c.id];

              return (
                <div key={c.id} className="border border-slate-700 bg-slate-800/50 rounded-xl p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="text-white font-semibold m-0">{c.display_name}</h3>
                      <p className="text-slate-400 text-sm mt-1 mb-0">{c.bio}</p>
                    </div>
                    <div className="text-xs text-right shrink-0">
                      {c.manifesto_tx_hash && <p className="text-emerald-400 m-0">✅ Manifesto verified</p>}
                      {c.stance_tx_hash && <p className="text-emerald-400 m-0">✅ Positions verified</p>}
                    </div>
                  </div>

                  {stances && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2">
                        Policy Positions
                        {c.stance_tx_hash && <span className="text-emerald-400 text-[11px] font-normal">🔒 Locked on blockchain</span>}
                      </p>
                      <div className="flex flex-col gap-2">
                        {TOPICS.map(t => (
                          <div key={t.key}>
                            <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                              <span>{t.label}</span>
                            </div>
                            <StanceBar value={stances[t.key] || 0} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.manifesto_uri && (
                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                      <a
                      
                        href={API_BASE + "/" + c.manifesto_uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 text-sm hover:underline"
                      >
                        📄 View Manifesto
                      </a>
                      <button
                        onClick={() => verifyIntegrity(c.id)}
                        className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 hover:bg-slate-700 transition-colors"
                      >
                        Verify Integrity
                      </button>
                    </div>
                  )}

                  {vr && (
                    <p className={`text-xs mt-2 ${vr.loading ? "text-slate-400" : vr.intact ? "text-emerald-400" : "text-red-400"}`}>
                      {vr.loading ? "Checking..." : vr.message || vr.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a href={`/voter/survey?election=${id}`}>
              <button className="bg-slate-800 border border-slate-700 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-slate-700 transition-colors">
                Take Matching Survey →
              </button>
            </a>
            <a href={`/voter/vote?election=${id}`}>
              <button className="bg-cyan-400 text-slate-950 text-sm font-semibold rounded-lg px-4 py-2 hover:bg-cyan-300 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                Cast Your Vote →
              </button>
            </a>
            <a href={`/results/${id}`}>
              <button className="bg-slate-800 border border-slate-700 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-slate-700 transition-colors">
                View Results →
              </button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}