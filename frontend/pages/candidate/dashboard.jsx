import { useState, useEffect } from "react";
import { ethers } from "ethers";
import api from "../../lib/api";

export default function CandidateDashboard() {
  const [profile, setProfile] = useState(null);
  const [electionId, setElectionId] = useState("1");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [file, setFile] = useState(null);
  const [log, setLog] = useState("");

  useEffect(() => { loadProfile(); }, []);

  async function loadProfile() {
    try {
      const { data } = await api.get("/candidate/profile");
      setProfile(data.candidate);
      localStorage.setItem("candidateId", data.candidate.id);
    } catch {}
  }

  async function createProfile() {
    let publicKey = "";
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        publicKey = await signer.getAddress();
      } catch {
        setLog("Wallet connection skipped — continuing without a signing key.");
      }
    }

    try {
      const { data } = await api.post("/candidate/profile", {
        electionId, displayName, bio, publicKey
      });
      setLog(`Profile submitted — pending admin approval. Candidate ID: ${data.candidateId}`);
      loadProfile();
    } catch (err) {
      setLog(err.response?.data?.error || "Failed to create profile");
    }
  }

  async function uploadManifesto() {
    if (!file) { setLog("Select a PDF file first."); return; }
    const candidateId = localStorage.getItem("candidateId");

    const buffer = await file.arrayBuffer();
    const contentHash = ethers.keccak256(new Uint8Array(buffer));

    let signature = "0x";
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        signature = await signer.signMessage(ethers.getBytes(contentHash));
        setLog("File signed. Uploading...");
      } catch {
        setLog("Wallet signing skipped — uploading without signature.");
      }
    }

    const form = new FormData();
    form.append("file", file);
    form.append("signature", signature);

    try {
      const { data } = await api.post(`/candidate/manifesto/${candidateId}`, form, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setLog(`✅ Manifesto uploaded and anchored to blockchain!\nHash: ${data.contentHash}\nTx: ${data.txHash}`);
      loadProfile();
    } catch (err) {
      setLog(err.response?.data?.error || "Upload failed");
    }
  }

  const statusColor = {
    PENDING: "text-amber-400",
    APPROVED: "text-emerald-400",
    REJECTED: "text-red-400"
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
          <h1 className="text-2xl font-bold text-white mb-6">Candidate Dashboard</h1>

          {profile && (
            <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg mb-6">
              <h3 className="text-white font-semibold m-0">{profile.display_name}</h3>
              <p className="text-sm text-slate-300 mt-1 mb-0">
                Status:{" "}
                <strong className={statusColor[profile.status]}>{profile.status}</strong>
              </p>
              {profile.stance_tx_hash && (
                <p className="text-xs text-slate-400 mt-2 mb-0">
                  ✅ Policy positions anchored on blockchain<br />
                  Tx: {profile.stance_tx_hash.slice(0, 20)}...
                </p>
              )}
              {profile.manifesto_tx_hash && (
                <p className="text-xs text-slate-400 mt-2 mb-0">
                  ✅ Manifesto anchored on blockchain<br />
                  Tx: {profile.manifesto_tx_hash.slice(0, 20)}...
                </p>
              )}
            </div>
          )}

          {!profile && (
            <div className="p-5 border border-slate-700 rounded-xl mb-6">
              <h2 className="text-lg font-semibold text-white mb-3">Step 1 — Create Profile</h2>
              <div className="flex flex-col gap-3">
                <input
                  placeholder="Election ID"
                  value={electionId}
                  onChange={e => setElectionId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                />
                <input
                  placeholder="Your display name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                />
                <textarea
                  placeholder="Short bio (2-3 sentences)"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={3}
                  className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                />
                <button
                  onClick={createProfile}
                  className="bg-cyan-400 text-slate-950 font-semibold rounded-lg py-2.5 hover:bg-cyan-300 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                >
                  Submit Profile 
                </button>
              </div>
            </div>
          )}

          {profile && (
            <div className="p-5 border border-slate-700 rounded-xl mb-6">
              <h2 className="text-lg font-semibold text-white mb-3">Step 2 — Set Policy Positions</h2>
              {profile.status === "APPROVED" ? (
                <div>
                  <p className="text-emerald-400 text-sm">
                    ✅ Your positions are locked on the blockchain and cannot be changed.
                  </p>
                  <p className="text-xs text-slate-400">
                    This happened automatically when the admin approved your profile.
                    Voters can verify your positions are unchanged.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-slate-300 mb-3">
                    Set your position on each policy topic. Once admin approves your profile,
                    these will be permanently locked on the blockchain.
                  </p>
                  <a href="/candidate/stances">
                    <button className="bg-slate-800 border border-slate-700 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-slate-700 transition-colors">
                      Fill Policy Survey →
                    </button>
                  </a>
                </div>
              )}
            </div>
          )}

          {profile && (
            <div className="p-5 border border-slate-700 rounded-xl mb-6">
              <h2 className="text-lg font-semibold text-white mb-3">Step 3 — Upload Manifesto</h2>

              {profile.manifesto_tx_hash ? (
                <div>
                  <p className="text-emerald-400 text-sm">
                    ✅ Your manifesto is locked on the blockchain and cannot be replaced.
                  </p>
                  <p className="text-xs text-slate-400">
                    This is your one and only manifesto for this election. Voters can verify
                    it's unchanged using "Verify Integrity" on the public election page.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-slate-300 mb-3">
                    Upload your manifesto PDF. It will be immediately and permanently anchored
                    to the blockchain — you will not be able to upload a different file
                    afterward, so make sure this is final.
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={e => setFile(e.target.files[0])}
                    className="text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-800 file:text-white hover:file:bg-slate-700 file:cursor-pointer"
                  />
                  <button
                    onClick={uploadManifesto}
                    className="block mt-3 bg-cyan-400 text-slate-950 font-semibold rounded-lg px-4 py-2.5 hover:bg-cyan-300 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                  >
                    Upload &amp; Anchor to Blockchain
                  </button>
                </div>
              )}
            </div>
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