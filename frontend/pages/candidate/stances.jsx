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

export default function CandidateStanceSurvey() {
  const [stances, setStances] = useState(
    TOPICS.reduce((acc, t) => ({ ...acc, [t.key]: 0 }), {})
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function updateStance(key, value) {
    setStances((prev) => ({ ...prev, [key]: Number(value) }));
  }

  async function saveStances() {
    const candidateId = localStorage.getItem("candidateId");
    if (!candidateId) {
      setError("Create your candidate profile first (go back to dashboard).");
      return;
    }
    try {
      await api.post(`/candidate/stances/${candidateId}`, { stanceVector: stances });
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save stances");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
          <h1 className="text-2xl font-bold text-white mb-2">Your Policy Positions</h1>
          <p className="text-sm text-slate-400 mb-6">
            Set your stance on each topic. Voters will be matched to you based on
            how closely their opinions align with yours. Be honest — this is what
            voters use to decide who to support.
          </p>

          <div className="flex flex-col gap-6">
            {TOPICS.map((t) => (
              <div key={t.key}>
                <div className="flex justify-between mb-1">
                  <label className="text-sm text-slate-200 font-medium">{t.label}</label>
                  <span
                    className={`text-sm font-semibold ${
                      stances[t.key] > 0
                        ? "text-emerald-400"
                        : stances[t.key] < 0
                        ? "text-red-400"
                        : "text-slate-400"
                    }`}
                  >
                    {stances[t.key] > 0 ? `+${stances[t.key]}` : stances[t.key]}
                  </span>
                </div>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={stances[t.key]}
                  onChange={(e) => updateStance(t.key, e.target.value)}
                  className="w-full accent-cyan-400"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Strongly Against</span>
                  <span>Neutral</span>
                  <span>Strongly For</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={saveStances}
            className="w-full mt-6 bg-cyan-400 text-slate-950 font-semibold rounded-lg py-2.5 hover:bg-cyan-300 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.4)]"
          >
            Save My Policy Positions
          </button>

          {saved && (
            <p className="mt-3 text-sm text-emerald-400">
              ✅ Positions saved — voters will now be matched against these.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          <p className="mt-4 text-sm">
            <a href="/candidate/dashboard" className="text-cyan-400 hover:underline">
              ← Back to dashboard
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}