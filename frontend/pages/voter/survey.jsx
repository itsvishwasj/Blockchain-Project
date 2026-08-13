import { useState } from "react";
import api from "../../lib/api";

const TOPICS = [
  { key: "economy", label: "Economy" },
  { key: "environment", label: "Environment" },
  { key: "healthcare", label: "Healthcare" },
  { key: "education", label: "Education" },
  { key: "civil_rights", label: "Civil Rights" },
  { key: "security", label: "Security" }
];

export default function VoterSurvey() {
  const [electionId, setElectionId] = useState("1");
  const [answers, setAnswers] = useState(
    TOPICS.reduce((acc, t) => ({ ...acc, [t.key]: 0 }), {})
  );
  const [ranked, setRanked] = useState(null);
  const [status, setStatus] = useState("");

  function updateAnswer(key, value) {
    setAnswers((prev) => ({ ...prev, [key]: Number(value) }));
  }

  async function submitSurvey() {
    setStatus("Matching you against candidate platforms...");
    try {
      const { data } = await api.post(`/voter/elections/${electionId}/match`, { answers });
      setRanked(data.ranked);
      setStatus("");
    } catch (err) {
      setStatus(err.response?.data?.error || "Matching failed");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
          <h1 className="text-2xl font-bold text-white mb-2">Candidate Matching Survey</h1>
          <p className="text-sm text-slate-400 mb-6">
            Slide each topic from -1 (strongly against) to +1 (strongly for). This is purely
            advisory — it never touches your actual anonymous vote.
          </p>

          <label className="text-sm text-slate-300 block mb-6">
            Election ID
            <input
              value={electionId}
              onChange={(e) => setElectionId(e.target.value)}
              className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
            />
          </label>

          <div className="flex flex-col gap-5">
            {TOPICS.map((t) => (
              <div key={t.key}>
                <label className="text-sm text-slate-300 flex justify-between mb-1">
                  <span>{t.label}</span>
                  <span className="text-cyan-400 font-semibold">{answers[t.key]}</span>
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={answers[t.key]}
                  onChange={(e) => updateAnswer(t.key, e.target.value)}
                  className="w-full accent-cyan-400"
                />
              </div>
            ))}
          </div>

          <button
            onClick={submitSurvey}
            className="w-full mt-6 bg-cyan-400 text-slate-950 font-semibold rounded-lg py-2.5 hover:bg-cyan-300 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.4)]"
          >
            Find My Matches
          </button>

          {status && (
            <p className="mt-3 text-sm text-slate-300">{status}</p>
          )}

          {ranked && (
            <div className="mt-6 p-4 bg-emerald-400/10 border border-emerald-400/20 rounded-lg">
              <h2 className="text-white font-semibold mb-3">Your Matches</h2>
              <ol className="list-decimal list-inside flex flex-col gap-1.5">
                {ranked.map((r) => (
                  <li key={r.candidateId} className="text-sm text-slate-200">
                    {r.name} — match score:{" "}
                    <span className="text-emerald-300 font-semibold">{r.score}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}