import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default function PublicResults() {
  const router = useRouter();
  const { id } = router.query;
  const [election, setElection] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    loadElection();
  }, [id]);

  async function loadElection() {
    try {
      const { data } = await axios.get(`${API_BASE}/public/elections/${id}/status`);
      setElection(data);
      if (data.liveStatus === "CLOSED" || data.liveStatus === "FINALIZED") {
        loadResults();
      }
    } catch (err) {
      setError("Election not found");
    }
  }

  async function loadResults() {
    try {
      const { data } = await axios.get(`${API_BASE}/public/elections/${id}/results`);
      setResults(data.results);
    } catch (err) {
      setError(err.response?.data?.error || "Could not load results");
    }
  }

  if (!election)
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );

  const winner = results && results[0];

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
          <h1 className="text-2xl font-bold text-white mb-4">{election.title}</h1>

          <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg mb-6 text-sm text-slate-300">
            <p className="m-0">
              <strong className="text-slate-100">Status:</strong> {election.liveStatus}
            </p>
            <p className="m-0 mt-1">
              <strong className="text-slate-100">Voting period:</strong>{" "}
              {new Date(election.start_time).toLocaleString()} →{" "}
              {new Date(election.end_time).toLocaleString()}
            </p>
          </div>

          {election.liveStatus === "OPEN" && (
            <div className="p-4 bg-emerald-400/10 border border-emerald-400/20 rounded-lg text-sm text-emerald-200">
              <p className="m-0">🗳️ Election is currently open. Results will be visible once it closes.</p>
              <p className="m-0 mt-1">Closes at: {new Date(election.end_time).toLocaleString()}</p>
            </div>
          )}

          {results && (
            <div className="mt-2">
              <h2 className="text-xl font-semibold text-white mb-4">Final Results</h2>

              {winner && (
                <div className="p-5 bg-amber-400/10 border border-amber-400/20 rounded-lg mb-5 text-center">
                  <p className="text-xs text-slate-400 m-0">Winner</p>
                  <h2 className="text-2xl font-bold text-white my-1">🏆 {winner.name}</h2>
                  <p className="text-sm text-amber-200 m-0">{winner.votes} votes</p>
                </div>
              )}

              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-700">
                    <th className="text-left py-2 text-slate-400 font-medium">Rank</th>
                    <th className="text-left py-2 text-slate-400 font-medium">Candidate</th>
                    <th className="text-right py-2 text-slate-400 font-medium">Votes</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr
                      key={r.candidateId}
                      className={`border-b border-slate-800 ${
                        i === 0 ? "bg-amber-400/5" : ""
                      }`}
                    >
                      <td className="py-2 text-slate-300">#{i + 1}</td>
                      <td className="py-2 text-white">{r.name}</td>
                      <td className="py-2 text-right text-cyan-300 font-semibold">{r.votes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-4 text-xs text-slate-500">
                Results are read directly from the blockchain — they cannot be altered after the
                election closes. Anyone can independently verify these numbers by querying the
                smart contract directly.
              </p>
            </div>
          )}

          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
        </div>
      </div>
    </div>
  );
}