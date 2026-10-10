import { useState } from "react";
import api from "../../lib/api";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

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
      setError("Create your candidate profile first on the candidate portal.");
      return;
    }
    try {
      await api.post(`/candidate/stances/${candidateId}`, { stanceVector: stances });
      setSaved(true);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save stances");
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6fc] text-slate-800 font-sans flex flex-col">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/candidate/dashboard" className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-lg shadow-sm">
              +
            </Link>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 leading-none">Policy Positions Editor</h1>
              <p className="text-[11px] text-slate-500 mt-0.5">Interactive 6-Axis AI Candidate Policy Vector Setup</p>
            </div>
          </div>

          <Link
            href="/candidate/dashboard"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-xl transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Candidate Portal
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full">
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_4px_25px_-2px_rgba(0,0,0,0.03)] space-y-6">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-1">Set Policy Stances</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Configure your policy vector across key topics. Voters use these vectors in client-side AI Cosine Matching to discover aligned candidates.
            </p>
          </div>

          <div className="space-y-5">
            {TOPICS.map((t) => (
              <div key={t.key} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-slate-700">{t.label}</label>
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-md ${
                      stances[t.key] > 0
                        ? "bg-emerald-100 text-emerald-800"
                        : stances[t.key] < 0
                        ? "bg-rose-100 text-rose-800"
                        : "bg-slate-200 text-slate-700"
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
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-400 mt-1.5 font-medium">
                  <span>Strongly Against (-1.0)</span>
                  <span>Neutral (0.0)</span>
                  <span>Strongly For (+1.0)</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={saveStances}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm active:scale-[0.99]"
          >
            Save Policy Stance Vectors →
          </button>

          {saved && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <span>Positions saved successfully — voters will now be matched against your policy vectors.</span>
            </div>
          )}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}