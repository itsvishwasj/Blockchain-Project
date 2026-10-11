import { useState, useEffect, useMemo, useRef } from 'react';
import { api, API_BASE } from '@/lib/api';
import { simulateKeccak256 } from '@/lib/crypto';
import { PolicySliders, createEmptyStance } from '@/components/PolicySliders';
import {
  UserPlus,
  Hash,
  Send,
  FileText,
  BarChart3,
  Info,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  AlertCircle,
  Loader2,
  UserCheck,
  Cpu,
  Upload,
  ExternalLink,
  Paperclip,
  Check,
} from 'lucide-react';

export function CandidateTab({ onSubmit, registrationLocked, toast }) {
  const [profile, setProfile] = useState(null);
  const [userApplications, setUserApplications] = useState([]);
  const [electionsList, setElectionsList] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [manifesto, setManifesto] = useState('');
  const [manifestoFile, setManifestoFile] = useState(null);
  const [stance, setStance] = useState(createEmptyStance());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef(null);

  const manifestoHash = useMemo(() => {
    if (manifestoFile) {
      return simulateKeccak256(`${manifestoFile.name}:${manifestoFile.size}:${manifesto}`);
    }
    if (!manifesto.trim()) return '0x' + '0'.repeat(64);
    return simulateKeccak256(manifesto);
  }, [manifesto, manifestoFile]);

  useEffect(() => {
    loadProfileAndElections();
    const interval = setInterval(() => {
      loadProfileAndElections(true);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  async function loadProfileAndElections(isBackgroundPoll = false) {
    if (!isBackgroundPoll) setLoading(true);
    try {
      const [electionsRes, profileRes] = await Promise.all([
        api.get('/candidate/elections').catch(() => api.get('/public/elections')).catch(() => ({ data: { elections: [] } })),
        api.get('/candidate/profile').catch(() => ({ data: { candidate: null, candidates: [] } })),
      ]);

      const list = electionsRes.data.elections || [];
      setElectionsList(list);

      const apps = profileRes.data.candidates || (profileRes.data.candidate ? [profileRes.data.candidate] : []);
      setUserApplications(apps);

      let targetElectionId = selectedElectionId;
      if (!targetElectionId) {
        if (typeof window !== 'undefined') {
          const path = window.location.pathname;
          const pathParts = path.split('/').filter(Boolean);
          if (pathParts.length >= 2 && pathParts[0] === 'candidate') {
            const idx = pathParts.indexOf('elections');
            if (idx !== -1 && idx < pathParts.length - 1) {
              targetElectionId = pathParts.slice(idx + 1).join('/');
            }
          }
          if (!targetElectionId) {
            targetElectionId = localStorage.getItem('activeCandidateElectionId') || '';
          }
        }
      }

      if (!targetElectionId && apps.length > 0 && apps[0].election_id) {
        targetElectionId = String(apps[0].election_id);
      }
      if (!targetElectionId && list.length > 0) {
        targetElectionId = String(list[0].id);
      }

      if (targetElectionId) {
        setSelectedElectionId(targetElectionId);
        const activeApp = apps.find(a => String(a.election_id) === String(targetElectionId)) || null;
        setProfile(activeApp);
        if (activeApp && activeApp.display_name) {
          setName(activeApp.display_name);
          if (activeApp.bio) setBio(activeApp.bio);
        }
      }
    } catch (err) {
      console.log('Load candidate info note:', err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectElection = (electionId) => {
    const idStr = String(electionId);
    setSelectedElectionId(idStr);
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeCandidateElectionId', idStr);
      window.history.pushState({}, '', `/candidate/elections/${idStr}`);
    }
    const matchingApp = userApplications.find(a => String(a.election_id) === idStr) || null;
    setProfile(matchingApp);
    if (matchingApp) {
      setName(matchingApp.display_name || '');
      setBio(matchingApp.bio || '');
    }
  };

  const handleStanceChange = (key, value) => {
    setStance(prev => ({ ...prev, [key]: value }));
  };

  const handleProfileFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !profile?.id) return;
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/candidate/manifesto/${profile.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast && toast('success', 'Manifesto Uploaded', 'Manifesto document uploaded and anchored on blockchain!');
      await loadProfileAndElections();
    } catch (err) {
      toast && toast('error', 'Upload Failed', err.response?.data?.error || err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedElectionId) {
      toast && toast('error', 'Select Election', 'Please select an election to participate in.');
      return;
    }
    if (!name.trim()) {
      toast && toast('error', 'Name Required', 'Please enter candidate name.');
      return;
    }
    if (!manifesto.trim() && !manifestoFile) {
      toast && toast('error', 'Manifesto Required', 'Please write your manifesto or upload a manifesto document.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/candidate/profile', {
        electionId: selectedElectionId,
        displayName: name.trim(),
        bio: bio.trim() || (manifestoFile ? `Candidate platform: ${manifestoFile.name}` : 'No bio provided.'),
        publicKey: '0x0',
      });

      const candidateId = data.candidateId;
      localStorage.setItem('candidateId', candidateId);

      await api.post(`/candidate/stances/${candidateId}`, { stanceVector: stance }).catch(() => {});

      // Upload manifesto document or text
      const formData = new FormData();
      if (manifestoFile) {
        formData.append('file', manifestoFile);
      }
      if (manifesto.trim()) {
        formData.append('manifesto', manifesto.trim());
      }
      await api.post(`/candidate/manifesto/${candidateId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }).catch(e => console.log('Manifesto upload note:', e.message));

      if (onSubmit) {
        onSubmit({
          name: name.trim(),
          bio: bio.trim() || 'No bio provided.',
          manifesto: manifesto.trim() || (manifestoFile ? manifestoFile.name : ''),
          manifestoHash,
          stance,
          electionId: selectedElectionId,
        });
      }

      toast && toast('success', 'Profile Submitted', `Candidate application for Election #${selectedElectionId} submitted! Status: PENDING Admin Approval.`);
      
      await loadProfileAndElections();
    } catch (err) {
      toast && toast('error', 'Submission Error', err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center space-y-3 shadow-xs">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto" />
        <p className="text-sm font-bold text-slate-700">Fetching Candidate Profiles &amp; Ongoing Elections...</p>
      </div>
    );
  }

  const statusStyle = {
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <div className="space-y-6">
      {registrationLocked && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <Info className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <p className="text-xs font-semibold text-amber-800">
            Registration is locked. Merkle root has been finalized — new candidate submissions are disabled.
          </p>
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* ONGOING ELECTIONS & CANDIDATE APPROVAL STATUS */}
      {/* ───────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Cpu className="h-5 w-5 text-purple-600" /> Ongoing Elections &amp; Candidate Approval Status
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select any ongoing election to view your approval status or apply to participate as a verified candidate.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            {electionsList.length} Ongoing Elections
          </span>
        </div>

        {electionsList.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            No ongoing elections found. Wait for an election administrator to launch an election.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {electionsList.map(el => {
              const elIdStr = String(el.id);
              const app = userApplications.find(a => String(a.election_id) === elIdStr);
              const isSelected = String(selectedElectionId) === elIdStr;
              const appStatus = app ? app.status : 'NOT_APPLIED';

              return (
                <div
                  key={el.id}
                  onClick={() => handleSelectElection(el.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                    isSelected
                      ? 'bg-purple-50/40 border-purple-400 ring-2 ring-purple-400/20 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold font-mono text-purple-700 uppercase tracking-wider block">
                        Election #{el.id} • {el.status || 'OPEN'}
                      </span>
                      <h3 className="text-sm font-extrabold text-slate-900 mt-0.5">{el.title}</h3>
                    </div>

                    {/* APPROVAL STATUS BADGE */}
                    {appStatus === 'APPROVED' && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 flex-shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Approved
                      </span>
                    )}
                    {appStatus === 'PENDING' && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 flex-shrink-0">
                        <Clock className="h-3.5 w-3.5 text-amber-600" /> Pending Review
                      </span>
                    )}
                    {appStatus === 'REJECTED' && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 flex-shrink-0">
                        <XCircle className="h-3.5 w-3.5 text-rose-600" /> Rejected
                      </span>
                    )}
                    {appStatus === 'NOT_APPLIED' && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 flex-shrink-0">
                        <UserPlus className="h-3.5 w-3.5 text-blue-600" /> Not Applied
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2">{el.description || 'No description provided.'}</p>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <span className="text-[11px] text-slate-400 font-medium">
                      {app ? `Application ID: #${app.id}` : 'Open to candidate applications'}
                    </span>
                    <span className={`font-bold text-[11px] ${isSelected ? 'text-purple-700' : 'text-slate-600'}`}>
                      {isSelected ? '✓ Currently Selected' : 'Click to Manage / Participate →'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────── */}
      {/* CANDIDATE PROFILE DETAILS & STATUS CARD */}
      {/* ───────────────────────────────────────────── */}
      {profile && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-100">
            <div>
              <span className={`text-xs font-extrabold px-3 py-1 rounded-full border ${statusStyle[profile.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                STATUS: {profile.status}
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 mt-2 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-blue-600" /> {profile.display_name}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{profile.bio}</p>
            </div>

            <div className="text-right font-mono text-xs text-slate-500">
              <p>Candidate ID: <span className="text-blue-700 font-bold">#{profile.id}</span></p>
              <p>Target Election: <span className="text-purple-700 font-bold">{profile.election_title || `Election #${profile.election_id}`}</span></p>
            </div>
          </div>

          {/* STATUS ACCEPTANCE / REJECTION NOTIFICATION CARD */}
          {profile.status === 'REJECTED' && (
            <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-xs space-y-2.5">
              <div className="flex items-center gap-2 text-rose-800 font-extrabold text-sm">
                <XCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
                <span>❌ Application Rejected by Administrator</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-rose-200 font-mono text-xs text-rose-900 space-y-1">
                <strong className="block text-[10px] text-slate-400 font-sans uppercase font-bold">Reason for Rejection:</strong>
                <p className="font-semibold text-rose-800">{profile.rejection_reason || 'Application does not meet specified candidate criteria or guidelines.'}</p>
              </div>
              <p className="text-slate-600 text-[11px]">
                Please review the rejection reason above. You may update your manifesto details or contact the election administrator for re-evaluation.
              </p>
            </div>
          )}

          {profile.status === 'PENDING' && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-bold text-amber-900">⏳ Application Under Administrator Review</p>
                <p className="text-[11px] text-slate-600">
                  Your candidate profile and manifesto are pending administrator review &amp; Keccak-256 on-chain attestation.
                </p>
              </div>
            </div>
          )}

          {profile.status === 'APPROVED' && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-bold text-emerald-900">✅ Application Approved &amp; Attested On-Chain</p>
                <p className="text-[11px] text-slate-600">
                  Your manifesto Keccak-256 hash and policy vectors are anchored to smart contracts (`ContentAttestation.sol`).
                </p>
              </div>
            </div>
          )}

          {/* Blockchain Attestation Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className={`p-3.5 rounded-2xl border text-xs font-mono ${profile.stance_tx_hash ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50/70 border-amber-200 text-amber-800'}`}>
              <div className="flex items-center gap-2 font-bold mb-1">
                <Cpu className="h-4 w-4 text-emerald-600" /> Policy Stances Attestation
              </div>
              {profile.stance_tx_hash ? (
                <div>
                  <p className="text-[10px] font-bold text-emerald-800 font-sans mb-0.5">✅ Anchored On-Chain (Voting.sol)</p>
                  <p className="text-[10px] truncate text-slate-700">Tx: {profile.stance_tx_hash}</p>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] font-bold text-amber-900 font-sans mb-0.5">⏳ Application Under Admin Review</p>
                  <p className="text-[10px] text-amber-700 font-sans leading-tight">Vectors will be anchored on-chain upon admin approval.</p>
                </div>
              )}
            </div>

            <div className={`p-3.5 rounded-2xl border text-xs font-mono ${profile.manifesto_tx_hash ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50/70 border-amber-200 text-amber-800'}`}>
              <div className="flex items-center gap-2 font-bold mb-1">
                <FileText className="h-4 w-4 text-blue-600" /> Keccak-256 Manifesto Attestation
              </div>
              {profile.manifesto_tx_hash ? (
                <div>
                  <p className="text-[10px] font-bold text-emerald-800 font-sans mb-0.5">✅ Anchored On-Chain (ContentAttestation.sol)</p>
                  <p className="text-[10px] truncate text-slate-700">Tx: {profile.manifesto_tx_hash}</p>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] font-bold text-amber-900 font-sans mb-0.5">⏳ Application Under Admin Review</p>
                  <p className="text-[10px] text-amber-700 font-sans leading-tight">Manifesto hash will be committed to blockchain upon admin approval.</p>
                </div>
              )}
            </div>
          </div>

          {/* Uploaded Manifesto File Link / Attachment Action */}
          {profile.manifesto_uri && (
            <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2 text-blue-950 font-bold">
                <FileText className="h-4 w-4 text-blue-600" />
                <span>Uploaded Manifesto Document:</span>
                <span className="font-mono text-slate-600 font-normal truncate max-w-[220px]">{profile.manifesto_uri}</span>
              </div>
              <a
                href={profile.manifesto_uri.startsWith('http') ? profile.manifesto_uri : `${API_BASE}/${profile.manifesto_uri}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View Uploaded Manifesto File ↗
              </a>
            </div>
          )}

          {!profile.manifesto_tx_hash && (
            <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs font-bold text-purple-900">Upload / Replace Manifesto Document</p>
                <p className="text-[11px] text-slate-500">Attach an official PDF, Word doc, or text file before admin attestation locks</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  id="cand-profile-manifesto-file"
                  accept=".pdf,.doc,.docx,.txt"
                  disabled={uploadingDoc}
                  onChange={handleProfileFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="cand-profile-manifesto-file"
                  className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingDoc ? 'Uploading...' : 'Upload Manifesto Document'}
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* CANDIDATE REGISTRATION FORM (With Election Dropdown) */}
      {/* ───────────────────────────────────────────── */}
      {!profile && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-purple-100 bg-purple-50 text-purple-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Candidate Registration</h2>
              <p className="text-xs text-slate-500">Select an active election and submit your manifesto with cryptographic attestation</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* ELECTION SELECTOR DROPDOWN */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-blue-700">
                Select Election to Participate In *
              </label>
              <select
                value={selectedElectionId}
                disabled={registrationLocked}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedElectionId(val);
                  if (typeof window !== 'undefined' && val) {
                    localStorage.setItem('activeCandidateElectionId', String(val));
                    window.history.pushState({}, '', `/candidate/elections/${val}`);
                  }
                }}
                className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none transition-all cursor-pointer font-sans disabled:opacity-50"
              >
                <option value="">-- Choose Active Election --</option>
                {electionsList.map(el => (
                  <option key={el.id} value={el.id}>
                    Election #{el.id}: {el.title} ({el.status})
                  </option>
                ))}
              </select>
              {electionsList.length === 0 && (
                <p className="text-[11px] text-slate-400 mt-1 italic">No active elections loaded yet. Create an election in Admin Module first.</p>
              )}
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Full Display Name *</label>
                <input
                  type="text"
                  value={name}
                  disabled={registrationLocked}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-400 disabled:opacity-50"
                  placeholder="e.g., Alice Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Short Platform Summary / Bio</label>
                <input
                  type="text"
                  value={bio}
                  disabled={registrationLocked}
                  onChange={e => setBio(e.target.value)}
                  className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-400 disabled:opacity-50"
                  placeholder="e.g., Student Senate Representative Candidate"
                />
              </div>
            </div>

            {/* Manifesto File Upload */}
            <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-200/80 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-bold text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Upload className="h-4 w-4 text-purple-600" /> Upload Manifesto Document (PDF / DOC / TXT)
                </label>
                <span className="text-[11px] text-purple-700 font-medium">Voters will be able to view &amp; read this file</span>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,.doc,.docx,.txt"
                disabled={registrationLocked}
                onChange={e => {
                  const file = e.target.files && e.target.files[0];
                  if (file) setManifestoFile(file);
                }}
                className="hidden"
              />

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  disabled={registrationLocked}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-purple-300 bg-white hover:bg-purple-50 text-purple-700 font-bold text-xs transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <Paperclip className="h-3.5 w-3.5 text-purple-600" />
                  {manifestoFile ? 'Change Manifesto File' : 'Choose Manifesto File (PDF, DOCX, TXT)'}
                </button>

                {manifestoFile ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl text-xs font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span className="truncate max-w-[220px] font-mono">{manifestoFile.name}</span>
                    <span className="text-[10px] text-emerald-600 font-mono">({Math.round(manifestoFile.size / 1024)} KB)</span>
                    <button
                      type="button"
                      onClick={() => {
                        setManifestoFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="text-rose-500 hover:text-rose-700 ml-1 font-bold cursor-pointer"
                      title="Remove file"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">No document chosen (You can upload a file or write text below)</span>
                )}
              </div>
            </div>

            {/* Manifesto Area */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Policy Manifesto Summary {manifestoFile ? '(Optional when file is attached)' : `* (${manifesto.length} chars)`}
                </label>
                {manifestoFile && (
                  <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    File selected: {manifestoFile.name}
                  </span>
                )}
              </div>
              <textarea
                value={manifesto}
                disabled={registrationLocked}
                onChange={e => setManifesto(e.target.value)}
                rows={3}
                className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-400 disabled:opacity-50"
                placeholder={manifestoFile ? "Add an optional short summary of your uploaded manifesto..." : "Write your policy manifesto — this will be hashed with Keccak-256 and anchored on-chain..."}
              />
            </div>

            {/* Real-time Keccak-256 Display */}
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Hash className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-slate-700 block mb-0.5">Real-time Keccak-256 Cryptographic Hash</span>
                <p className="font-mono text-xs text-blue-700 break-all">
                  {manifesto.trim() ? manifestoHash : '0x0000...0000'}
                </p>
              </div>
            </div>

            {/* Policy Sliders */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  6 Policy Stance Vectors
                </h3>
              </div>
              <PolicySliders stance={stance} onChange={handleStanceChange} disabled={registrationLocked} />
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={registrationLocked || submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit Candidate Registration &amp; Attest Manifesto →
            </button>
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-start gap-3 text-xs text-slate-500 shadow-xs">
        <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Your manifesto is hashed using Keccak-256 and submitted for admin attestation. The 6 policy stance vectors are used by the AI Policy Matcher to compute cosine similarity against voter preferences without revealing voter identity.
        </p>
      </div>
    </div>
  );
}
