import { useState, useEffect } from "react";
import api from "../../lib/api";

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

export default function AdminDashboard() {
  const [electionId, setElectionId] = useState("");
  const [activeElection, setActiveElection] = useState(null);
  const [lookupId, setLookupId] = useState("");

  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [log, setLog] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [roll, setRoll] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [results, setResults] = useState([]);
  const [verifyResults, setVerifyResults] = useState({});

  async function manageElection(id) {
    try {
      const { data } = await api.get(`/admin/elections/${id}`);
      setActiveElection(data.election);
      setElectionId(String(id));
      setCandidates([]);
      setRoll([]);
      setResults([]);
      setVerifyResults({});
      setLog("");
    } catch (err) {
      setLog("❌ " + (err.response?.data?.error || "Election not found"));
    }
  }

  function backToList() {
    setActiveElection(null);
    setElectionId("");
    setLookupId("");
  }

  async function createElection() {
    try {
      const { data } = await api.post("/admin/elections", {
        title, description: "", startTime, endTime,
        contractAddress: process.env.NEXT_PUBLIC_VOTING_ADDRESS || "0x0"
      });
      setLog(`✅ Election #${data.electionId} created.`);
      setTitle(""); setStartTime(""); setEndTime("");
      manageElection(data.electionId);
    } catch (err) { setLog("❌ " + (err.response?.data?.error || "Failed")); }
  }

  async function uploadVoterRoll() {
    if (!csvFile) { setLog("Select a CSV file first."); return; }
    const form = new FormData();
    form.append("file", csvFile);
    try {
      const { data } = await api.post(`/admin/elections/${electionId}/voter-roll`, form, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setLog(`✅ Voter roll uploaded — ${data.added} voters added, ${data.skipped} skipped.`);
    } catch (err) { setLog("❌ " + (err.response?.data?.error || "Upload failed")); }
  }

  async function viewRoll() {
    const { data } = await api.get(`/admin/elections/${electionId}/voter-roll`);
    setRoll(data.roll);
    setLog(`Showing ${data.total} voters on the roll.`);
  }

  async function loadCandidates() {
    const { data } = await api.get(`/admin/elections/${electionId}/candidates`);
    setCandidates(data.candidates);
  }

  async function setCandidateStatus(id, status) {
    await api.patch(`/admin/candidates/${id}/status`, { status });
    loadCandidates();
  }

  async function verifyIntegrity(candidateId) {
    setVerifyResults(prev => ({ ...prev, [candidateId]: { loading: true } }));
    try {
      const res = await fetch(`${API_BASE}/public/candidates/${candidateId}/verify-integrity`);
      const data = await res.json();
      setVerifyResults(prev => ({ ...prev, [candidateId]: data }));
    } catch (err) {
      setVerifyResults(prev => ({ ...prev, [candidateId]: { error: "Check failed" } }));
    }
  }

  async function publishVoterRoot() {
    try {
      const { data } = await api.post(`/admin/elections/${electionId}/voter-root`);
      setLog(`✅ Voter root published on-chain (${data.voterCount} approved voters).`);
    } catch (err) { setLog("❌ " + (err.response?.data?.error || "Failed")); }
  }

  async function lockVoterRoot() {
    await api.post(`/admin/elections/${electionId}/lock-voter-root`);
    setLog("✅ Voter root locked — no more registrations accepted.");
  }

  async function openOnChain() {
    try {
      const { data } = await api.post(`/admin/elections/${electionId}/open-onchain`);
      setLog(`✅ Election opened on-chain with ${data.candidateCount} candidates.`);
      manageElection(electionId);
    } catch (err) { setLog("❌ " + (err.response?.data?.error || "Failed")); }
  }

  async function loadResults() {
    try {
      const { data } = await api.get(`/admin/elections/${electionId}/results`);
      setResults(data.results);
    } catch (err) { setLog("❌ " + (err.response?.data?.error || "Failed")); }
  }

  const sectionClass = "mb-6 p-5 border border-slate-700 rounded-xl";
  const statusColor = {
    DRAFT: "text-slate-400",
    OPEN: "text-emerald-400",
    CLOSED: "text-amber-400"
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
          <h1 className="text-2xl font-bold text-white mb-6">Admin Dashboard</h1>

          {!activeElection ? (
            <>
              <div className={sectionClass}>
                <h2 className="text-lg font-semibold text-white mb-3">Manage Election by ID</h2>
                <div className="flex gap-3">
                  <input
                    placeholder="Election ID"
                    value={lookupId}
                    onChange={(e) => setLookupId(e.target.value)}
                    className="w-32 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                  <button
                    onClick={() => manageElection(lookupId)}
                    className="bg-cyan-400 text-slate-950 font-semibold rounded-lg px-4 py-2 hover:bg-cyan-300 transition-colors"
                  >
                    Load Election
                  </button>
                </div>
              </div>

              <div className={sectionClass}>
                <h2 className="text-lg font-semibold text-white mb-3">Create New Election</h2>
                <div className="flex flex-col gap-3">
                  <input
                    placeholder="Election title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                  <label className="text-sm text-slate-300 flex items-center gap-2">
                    Start:
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    />
                  </label>
                  <label className="text-sm text-slate-300 flex items-center gap-2">
                    End:
                    <input
                      type="datetime-local"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    />
                  </label>
                  <button
                    onClick={createElection}
                    className="bg-cyan-400 text-slate-950 font-semibold rounded-lg py-2.5 hover:bg-cyan-300 transition-colors"
                  >
                    Create
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <button onClick={backToList} className="text-sm text-cyan-400 hover:underline mb-4">
                ← Back
              </button>

              <div className={sectionClass}>
                <h2 className="text-lg font-semibold text-white mb-1">
                  #{activeElection.id} — {activeElection.title}
                </h2>
                <p className={`text-sm font-semibold mb-2 ${statusColor[activeElection.status] || "text-slate-400"}`}>
                  Status: {activeElection.status}
                </p>
                <p className="text-xs text-slate-400">
                  Start: {activeElection.start_time ? new Date(activeElection.start_time).toLocaleString() : "—"}<br />
                  End: {activeElection.end_time ? new Date(activeElection.end_time).toLocaleString() : "—"}
                </p>
              </div>

              <div className={sectionClass}>
                <h2 className="text-lg font-semibold text-white mb-2">Step 2 — Upload Voter Roll</h2>
                <p className="text-xs text-slate-400 mb-3">
                  CSV format:{" "}
                  <code className="bg-slate-800 px-1.5 py-0.5 rounded text-cyan-300">
                    full_name, email, voter_id
                  </code>{" "}
                  with header row.
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files[0])}
                  className="text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-800 file:text-white hover:file:bg-slate-700 file:cursor-pointer"
                />
                <div className="flex gap-3 mt-3">
                  <button onClick={uploadVoterRoll} className="bg-cyan-400 text-slate-950 font-semibold text-sm rounded-lg px-4 py-2 hover:bg-cyan-300 transition-colors">
                    Upload CSV
                  </button>
                  <button onClick={viewRoll} className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-4 py-2 hover:bg-slate-700 transition-colors">
                    View Current Roll
                  </button>
                </div>
                {roll.length > 0 && (
                  <table className="w-full mt-4 text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-800">
                        <th className="p-1.5 text-left text-slate-400">Name</th>
                        <th className="p-1.5 text-left text-slate-400">Email</th>
                        <th className="p-1.5 text-left text-slate-400">ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roll.map((r, i) => (
                        <tr key={i} className="border-b border-slate-800">
                          <td className="p-1.5 text-slate-300">{r.full_name}</td>
                          <td className="p-1.5 text-slate-300">{r.email}</td>
                          <td className="p-1.5 text-slate-300">{r.voter_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className={sectionClass}>
                <h2 className="text-lg font-semibold text-white mb-3">Step 3 — Review &amp; Approve Candidates</h2>
                <button onClick={loadCandidates} className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-4 py-2 hover:bg-slate-700 transition-colors mb-4">
                  Load Candidates
                </button>

                <div className="flex flex-col gap-4">
                  {candidates.map((c) => {
                    const stances = c.stance_vector
                      ? (typeof c.stance_vector === "string" ? JSON.parse(c.stance_vector) : c.stance_vector)
                      : null;
                    const vr = verifyResults[c.id];

                    return (
                      <div key={c.id} className="border border-slate-700 bg-slate-800/50 rounded-xl p-4">
                        <div className="flex justify-between items-start gap-3 flex-wrap">
                          <div>
                            <strong className="text-white">{c.display_name}</strong>
                            <span className="text-slate-400 text-sm ml-2">— {c.status}</span>
                            {c.bio && <p className="text-slate-400 text-sm mt-1 mb-0">{c.bio}</p>}
                          </div>
                          <div className="flex gap-2">
                            {c.status !== "APPROVED" && (
                              <button onClick={() => setCandidateStatus(c.id, "APPROVED")} className="bg-emerald-400/10 border border-emerald-400/30 text-emerald-300 text-xs rounded-lg px-2 py-1 hover:bg-emerald-400/20 transition-colors">
                                Approve
                              </button>
                            )}
                            {c.status !== "REJECTED" && (
                              <button onClick={() => setCandidateStatus(c.id, "REJECTED")} className="bg-red-400/10 border border-red-400/30 text-red-300 text-xs rounded-lg px-2 py-1 hover:bg-red-400/20 transition-colors">
                                Reject
                              </button>
                            )}
                          </div>
                        </div>

                        {stances && (
                          <div className="mt-4">
                            <p className="text-xs font-semibold text-slate-300 mb-2">
                              Policy Positions {c.stance_tx_hash && <span className="text-emerald-400 font-normal">🔒 Locked on blockchain</span>}
                            </p>
                            <div className="flex flex-col gap-2">
                              {TOPICS.map(t => (
                                <div key={t.key}>
                                  <div className="text-xs text-slate-400 mb-0.5">{t.label}</div>
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
              </div>

              <div className={sectionClass}>
                <h2 className="text-lg font-semibold text-white mb-2">Step 4 — Publish &amp; Open on Blockchain</h2>
                <p className="text-xs text-slate-400 mb-3">Do these three in order after all approvals are done.</p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={publishVoterRoot} className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-4 py-2 hover:bg-slate-700 transition-colors">
                    Publish Voter Root
                  </button>
                  <button onClick={lockVoterRoot} className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-4 py-2 hover:bg-slate-700 transition-colors">
                    Lock Voter Root
                  </button>
                  <button onClick={openOnChain} className="bg-cyan-400 text-slate-950 font-semibold text-sm rounded-lg px-4 py-2 hover:bg-cyan-300 transition-colors">
                    Open Election On-Chain
                  </button>
                </div>
              </div>

              <div className={sectionClass}>
                <h2 className="text-lg font-semibold text-white mb-3">Step 5 — Results</h2>
                <button onClick={loadResults} className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-4 py-2 hover:bg-slate-700 transition-colors">
                  Load Results
                </button>
                <p className="text-sm mt-3">
                  <a href={"/results/" + electionId} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">
                    View public results page
                  </a>
                </p>
                <ul className="mt-3 flex flex-col gap-1">
                  {results.map((r, i) => (
                    <li key={r.candidateId} className="text-sm text-slate-300">
                      #{i + 1} <strong className="text-white">{r.name}</strong> — {r.votes} votes
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {log && (
            <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 whitespace-pre-line">
              {log}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}