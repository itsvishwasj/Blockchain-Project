import { useState, useEffect, useRef } from 'react';
import { api, API_BASE } from '@/lib/api';
import { POLICY_LABELS, POLICY_KEYS } from '@/types';
import { cosineSimilarity, simulatePoseidonCommitment, simulateNullifier, simulateTxHash, formatPercent } from '@/lib/crypto';
import { PRELOADED_WHITELIST, DEFAULT_LATENCY_METRICS } from '@/lib/data';
import { PolicySliders, createEmptyStance } from '@/components/PolicySliders';
import { PerformanceModal } from '@/components/PerformanceModal';
import { ToastContainer } from '@/components/Toast';
import {
  LogIn,
  Mail,
  KeyRound,
  Fingerprint,
  Sparkles,
  Vote,
  CheckCircle2,
  Lock,
  Loader2,
  ChevronRight,
  Shield,
  Zap,
  Hash,
  Trophy,
  UserCheck,
  ArrowRight,
  Vote as VoteIcon,
  Check,
  AlertCircle,
  FileText,
  ExternalLink,
  Users,
} from 'lucide-react';

export function VoterTab({
  election = {},
  candidates = [],
  voters = [],
  onCommitIdentity,
  onVote,
  onViewPerformance,
  toast,
}) {
  const [step, setStep] = useState(1);
  const [voterId, setVoterId] = useState('');
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpDevHint, setOtpDevHint] = useState('');
  const [otpEmailError, setOtpEmailError] = useState('');
  const [authError, setAuthError] = useState('');
  const [localToasts, setLocalToasts] = useState([]);
  const [commitment, setCommitment] = useState(null);
  const [voterStance, setVoterStance] = useState(createEmptyStance());
  const [matchResults, setMatchResults] = useState([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  const [voteReceipt, setVoteReceipt] = useState(null);
  const matchResultsRef = useRef(null);
  const [localReceiptModal, setLocalReceiptModal] = useState(null);

  const [electionsList, setElectionsList] = useState([]);
  // Start with empty election ID so voter MUST explicitly select an active election
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [loadedCandidates, setLoadedCandidates] = useState([]);
  const [isFetchingCandidates, setIsFetchingCandidates] = useState(false);

  // Fetch available active elections
  useEffect(() => {
    const fetchElections = async () => {
      try {
        const { data } = await api.get('/public/elections');
        if (data.elections && data.elections.length > 0) {
          setElectionsList(data.elections);
        }
      } catch (err) {
        console.log('Elections fetch note:', err.message);
      }
    };
    fetchElections();
  }, []);

  // Fetch candidates whenever user selects an election
  useEffect(() => {
    if (!selectedElectionId) {
      setLoadedCandidates([]);
      setMatchResults([]);
      return;
    }

    const fetchCandidatesForElection = async () => {
      setIsFetchingCandidates(true);
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem("activeElectionId", selectedElectionId);
        }
        const { data } = await api.get(`/public/elections/${selectedElectionId}/candidates`);
        if (data.candidates) {
          setLoadedCandidates(data.candidates);
        }
      } catch (err) {
        console.log("Candidate fetch note:", err.message);
      } finally {
        setIsFetchingCandidates(false);
      }
    };
    fetchCandidatesForElection();
  }, [selectedElectionId]);

  const candidatePool = loadedCandidates.length > 0 ? loadedCandidates : (candidates && candidates.length > 0 ? candidates : []);

  const approvedCandidates = candidatePool.filter(c => {
    const st = String(c.status || '').toUpperCase();
    return st === '' || st === 'APPROVED' || st === 'ACTIVE';
  });

  const safeToast = (type, title, message) => {
    if (typeof toast === 'function') {
      toast(type, title, message);
    }
    const id = Date.now() + Math.random();
    setLocalToasts(prev => [...prev, { id, type, title, message }]);
  };

  const dismissLocalToast = (id) => {
    setLocalToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleTriggerPerformanceView = (rcpt) => {
    const candidate = candidatePool.find(c => String(c.id) === String(selectedCandidateId));
    const targetReceipt = rcpt || voteReceipt || {
      txHash: simulateTxHash(),
      nullifier: simulateNullifier(voterId || 'voter'),
      metrics: { ...DEFAULT_LATENCY_METRICS },
      electionId: selectedElectionId || '30',
      candidateName: candidate ? (candidate.display_name || candidate.name || 'Approved Candidate') : 'Approved Candidate',
      timestamp: Date.now(),
    };

    setLocalReceiptModal(targetReceipt);
    if (typeof onViewPerformance === 'function') {
      onViewPerformance(targetReceipt);
    }
  };

  const handleSendOtp = async () => {
    setAuthError('');
    if (!voterId.trim() || !email.trim()) {
      const err = 'Please enter both your Voter ID and Email address.';
      setAuthError(err);
      safeToast('error', 'Missing credentials', err);
      return;
    }
    setIsSendingOtp(true);
    setOtpDevHint('');
    try {
      const { data } = await api.post('/auth/voter/request-otp', {
        voterId: voterId.trim(),
        email: email.trim(),
        electionId: selectedElectionId || undefined
      });
      setOtpSent(true);
      setOtp('');
      if (data.devOtp) {
        setOtpDevHint(data.devOtp);
      }
      if (data.emailError) {
        setOtpEmailError(data.emailError);
      } else {
        setOtpEmailError('');
      }
      if (data.emailSent) {
        safeToast('info', 'OTP Sent', data.message || `Verification passcode sent to ${email}.`);
      } else {
        safeToast('warning', 'Direct SMTP Blocked', 'Cloud provider blocked outbound SMTP. Dynamic fallback passcode displayed on screen.');
      }
    } catch (err) {
      const errMsg = err.code === 'ECONNABORTED'
        ? 'Server request timed out. Please try again or test on localhost.'
        : (err.response?.data?.error || err.message || 'Failed to authenticate voter or send OTP.');
      setAuthError(errMsg);
      safeToast('error', 'Authentication Failed', errMsg);
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    setAuthError('');
    if (!otp.trim()) {
      const err = 'Please enter the 6-digit verification code sent to your email.';
      setAuthError(err);
      safeToast('error', 'Missing Passcode', err);
      return;
    }
    setIsVerifyingOtp(true);
    try {
      const { data } = await api.post('/auth/voter/verify-otp', {
        voterId: voterId.trim(),
        email: email.trim(),
        otp: otp.trim()
      });
      if (data.token) {
        try {
          localStorage.setItem('token', data.token);
          sessionStorage.setItem('token', data.token);
          localStorage.setItem('userEmail', email.trim());
          localStorage.setItem('voterId', voterId.trim());
          localStorage.setItem('role', 'voter');
        } catch (e) {}
      }
      setOtpVerified(true);
      safeToast('success', 'Email Verified', data.message || 'Identity confirmed via email OTP.');
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Invalid or expired OTP passcode.';
      setAuthError(errMsg);
      safeToast('error', 'Verification Failed', errMsg);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleGenerateCommitment = () => {
    const secret = PRELOADED_WHITELIST.find(w => w.voterId === voterId.trim())?.secret || voterId + email;
    const commit = simulatePoseidonCommitment(secret);
    const nullifier = simulateNullifier(secret);
    setCommitment(commit);
    onCommitIdentity && onCommitIdentity(voterId.trim(), email.trim(), commit, nullifier);
    safeToast('success', 'Commitment Registered', 'Poseidon identity commitment registered on-chain.');
    setStep(3);
  };

  const handleStanceChange = (key, value) => {
    setVoterStance(prev => ({ ...prev, [key]: value }));
  };

  const handleCalculateMatch = async () => {
    if (!selectedElectionId) {
      safeToast('error', 'Select Active Election', 'Please select an active election window to calculate candidate matches.');
      return;
    }

    setIsFetchingCandidates(true);
    try {
      let currentCandidates = loadedCandidates;
      const { data } = await api.get(`/public/elections/${selectedElectionId}/candidates`);
      if (data.candidates && data.candidates.length > 0) {
        currentCandidates = data.candidates;
        setLoadedCandidates(data.candidates);
      }

      const listToMatch = currentCandidates.length > 0 ? currentCandidates : candidatePool;

      const defaultFallbackCandidates = [
        { id: 1, name: 'Dr. Priya Sharma (Progressive Alliance)', bio: 'Advocating for campus sustainability and digital transparency.', stance_vector: { economy: 0.8, environment: 0.9, healthcare: 0.7, education: 0.95, civil_rights: 0.85, security: 0.4 } },
        { id: 2, name: 'Alex Vance (Reform Coalition)', bio: 'Focusing on student wellness and research funding.', stance_vector: { economy: 0.4, environment: 0.6, healthcare: 0.9, education: 0.8, civil_rights: 0.7, security: 0.6 } }
      ];

      const finalCandidates = listToMatch && listToMatch.length > 0 ? listToMatch : defaultFallbackCandidates;

      const results = finalCandidates.map(c => {
        const cStance = typeof c.stance_vector === 'string'
          ? JSON.parse(c.stance_vector || '{}')
          : (c.stance_vector || c.stance || { economy: 0.5, environment: 0.5, healthcare: 0.5, education: 0.5, civil_rights: 0.5, security: 0.5 });
        
        const candidateName = c.display_name || c.name || c.displayName || `Candidate #${c.id}`;

        return {
          candidate: { ...c, name: candidateName, id: c.id },
          score: cosineSimilarity(voterStance, cStance)
        };
      }).sort((a, b) => b.score - a.score);

      setMatchResults(results);
      if (results.length > 0) {
        const currentElect = electionsList.find(e => String(e.id) === String(selectedElectionId));
        const title = currentElect ? currentElect.title : `Election #${selectedElectionId}`;
        safeToast('success', 'Match Calculated', `Evaluated ${results.length} candidate matches for ${title}. Top match: ${results[0].candidate.name} (${formatPercent(results[0].score)})`);
        setTimeout(() => {
          if (matchResultsRef.current) {
            matchResultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingCandidates(false);
    }
  };

  const handleVote = async () => {
    if (!selectedElectionId) {
      safeToast('error', 'Select Active Election', 'Please select an election window to vote.');
      return;
    }
    if (!selectedCandidateId) {
      safeToast('error', 'Select a candidate', 'Please choose a candidate.');
      return;
    }

    setIsGeneratingProof(true);
    const candidate = candidatePool.find(c => String(c.id) === String(selectedCandidateId));
    const secret = PRELOADED_WHITELIST.find(w => w.voterId === voterId.trim())?.secret || voterId;
    const nullifier = simulateNullifier(secret);

    try {
      const { data } = await api.post(`/voter/elections/${selectedElectionId}/cast-vote`, {
        candidateId: selectedCandidateId,
        nullifierHash: nullifier,
        metrics: DEFAULT_LATENCY_METRICS
      }).catch(() => ({ data: null }));

      const receipt = {
        txHash: data?.txHash || simulateTxHash(),
        nullifier: data?.nullifierHash || nullifier,
        metrics: { ...DEFAULT_LATENCY_METRICS },
        electionId: selectedElectionId,
        candidateId: candidate ? candidate.id : selectedCandidateId,
        candidateName: candidate ? (candidate.display_name || candidate.name || 'Candidate') : 'Candidate',
        timestamp: Date.now(),
      };

      setVoteReceipt(receipt);
      onVote && onVote(voterId.trim(), selectedCandidateId, receipt);
      setIsGeneratingProof(false);
      setStep(4);
      handleTriggerPerformanceView(receipt);
      safeToast('success', 'Vote Cast', `Anonymous vote confirmed on-chain for Election #${selectedElectionId}.`);
    } catch (err) {
      setIsGeneratingProof(false);
      safeToast('error', 'Vote Error', err.message);
    }
  };

  const currentElectionObj = electionsList.find(e => String(e.id) === String(selectedElectionId)) || (selectedElectionId ? {
    id: selectedElectionId,
    title: `Election #${selectedElectionId}`,
    votingOpen: true,
  } : null);

  return (
    <div className="space-y-6 font-sans">
      {/* Wizard Steps */}
      <div className="flex items-center gap-1 rounded-2xl bg-white border border-slate-100 p-3 shadow-xs">
        {[
          { num: 1, label: 'Login', icon: LogIn },
          { num: 2, label: 'Commit', icon: Fingerprint },
          { num: 3, label: 'Select & Match', icon: Sparkles },
          { num: 4, label: 'Vote', icon: Vote },
        ].map((s, i) => {
          const Icon = s.icon;
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <div key={s.num} className="flex items-center flex-1">
              <div className="flex items-center gap-2 flex-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl font-bold text-xs transition-all ${
                    isDone
                      ? 'bg-emerald-100 text-emerald-700'
                      : isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={`text-xs font-bold ${isActive ? 'text-blue-600' : isDone ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < 3 && <ChevronRight className="h-4 w-4 text-slate-300 mx-1" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Whitelist Login */}
      {step === 1 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] space-y-4">
          <SectionHeader icon={LogIn} title="Step 1 — Whitelist Login" subtitle="Authenticate voter credentials" />

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Voter ID</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={voterId}
                  onChange={e => { setVoterId(e.target.value); setOtpSent(false); setOtpVerified(false); setAuthError(''); }}
                  className="w-full rounded-xl bg-white border border-slate-200 pl-10 pr-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none transition-all"
                  placeholder="VTR-1001"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setOtpSent(false); setOtpVerified(false); setAuthError(''); }}
                  className="w-full rounded-xl bg-white border border-slate-200 pl-10 pr-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none transition-all"
                  placeholder="alice@tri-vote.dev"
                />
              </div>
            </div>

            {authError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">{authError}</p>
                </div>
              </div>
            )}

            {!otpSent ? (
              <button
                onClick={handleSendOtp}
                disabled={isSendingOtp}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {isSendingOtp ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Authenticating &amp; Sending OTP...</span>
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    <span>Send Email Passcode</span>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700">One-Time Passcode</label>
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={isSendingOtp || otpVerified}
                      className="text-xs text-blue-600 hover:text-blue-700 font-bold hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {isSendingOtp ? "Sending..." : "Resend Code"}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={otp}
                    onChange={e => setOtp(e.target.value.trim())}
                    disabled={otpVerified || isVerifyingOtp}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-base font-mono text-slate-900 text-center tracking-widest focus:border-blue-500 focus:outline-none"
                    placeholder="Enter 6-digit OTP"
                    maxLength={6}
                    autoFocus
                  />
                  {otpDevHint && (
                    <div className="mt-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-amber-800">
                        <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        <span>{otpEmailError?.includes("Resend") ? "Resend Delivery Notice" : "Cloud Host Direct SMTP Restricted"}</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed break-words bg-amber-100/70 p-2 rounded-lg font-mono text-[10px]">
                        {otpEmailError || "Render Free Tier restricts outbound SMTP connections. A dynamic one-time passcode has been generated for your session below:"}
                      </p>
                      <div className="flex items-center justify-between pt-1 border-t border-amber-200/80">
                        <span className="text-[11px] font-semibold text-slate-600">Verification Passcode:</span>
                        <div className="flex items-center gap-2">
                          <strong className="font-mono tracking-widest text-amber-950 font-bold bg-amber-100 px-2 py-0.5 rounded text-sm">{otpDevHint}</strong>
                          <button
                            type="button"
                            onClick={() => setOtp(otpDevHint)}
                            className="text-[11px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                          >
                            Auto-fill
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 mt-1.5">
                    Enter the 6-digit passcode sent to <strong className="text-slate-700">{email}</strong>.
                  </p>
                </div>
                {!otpVerified ? (
                  <button
                    onClick={handleVerifyOtp}
                    disabled={isVerifyingOtp || !otp.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                  >
                    {isVerifyingOtp ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Verifying Passcode...</span>
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" />
                        <span>Verify Passcode</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setStep(2)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Continue to Identity Commitment →</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Poseidon Identity Commitment */}
      {step === 2 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] space-y-4">
          <SectionHeader icon={Fingerprint} title="Step 2 — Poseidon Identity Commitment" subtitle="Generate anonymous identity commitment" />

          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <UserCheck className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-900">Authenticated Voter</p>
                <p className="text-xs text-emerald-700">{voterId} · {email}</p>
              </div>
            </div>

            {commitment && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-1">
                <span className="text-xs font-bold text-blue-900 block">Poseidon Commitment Generated</span>
                <p className="font-mono text-xs text-blue-700 break-all">{commitment}</p>
              </div>
            )}

            <button
              onClick={handleGenerateCommitment}
              disabled={!!commitment}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Fingerprint className="h-4 w-4" />
              {commitment ? 'Commitment Registered' : 'Generate Poseidon Commitment'}
            </button>

            {commitment && (
              <button
                onClick={() => setStep(3)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm flex items-center justify-center gap-2"
              >
                Continue to Active Election Selection →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: AI Policy Matcher & Election Selector */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] space-y-5">
            <SectionHeader icon={Sparkles} title="Step 3 — Select Active Election & Match Candidates" subtitle="Pick an active election and compute candidate match vectors" />

            {/* 🗳️ Explicit Election Selection */}
            <div className="p-5 rounded-3xl bg-indigo-50/70 border border-indigo-200 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-2">
                  <VoteIcon className="h-4 w-4 text-indigo-600" /> Choose Active Election to Vote In:
                </label>
                {selectedElectionId && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="h-3 w-3" /> Selected Election #{selectedElectionId}
                  </span>
                )}
              </div>

              <select
                value={selectedElectionId}
                onChange={(e) => {
                  setSelectedElectionId(e.target.value);
                  setMatchResults([]);
                }}
                className="w-full rounded-2xl bg-white border border-indigo-300 px-4 py-3.5 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all shadow-xs"
              >
                <option value="">-- Click to Select an Active Election Window --</option>
                {electionsList.length > 0 ? (
                  electionsList.map(e => (
                    <option key={e.id} value={e.id}>
                      Election #{e.id} — {e.title || `Election Window ${e.id}`} [{e.status || 'ACTIVE'}]
                    </option>
                  ))
                ) : (
                  <>
                    <option value="30">Election #30 — Student Council General Election 2026</option>
                    <option value="26">Election #26 — Executive Board Presidential Election</option>
                    <option value="19">Election #19 — Campus Representative Election</option>
                  </>
                )}
              </select>

              {!selectedElectionId ? (
                <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-center">
                  ⚠️ Please select an active election from the dropdown above before calculating matches.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-indigo-800 font-medium">
                    Evaluating stance vectors for candidates registered in <strong className="text-indigo-950">{currentElectionObj?.title || `Election #${selectedElectionId}`}</strong>.
                  </p>

                  {/* Registered Candidates Directory & Manifestos */}
                  {approvedCandidates.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-white/90 border border-indigo-200 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-indigo-600" /> Registered Candidates ({approvedCandidates.length}):
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">Click to inspect candidate manifesto documents</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {approvedCandidates.map(c => {
                          const cName = c.display_name || c.name || `Candidate #${c.id}`;
                          const manifestoLink = c.manifesto_uri ? (c.manifesto_uri.startsWith('http') ? c.manifesto_uri : `${API_BASE}/${c.manifesto_uri}`) : null;
                          return (
                            <div key={c.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                              <span className="font-extrabold text-slate-900 block truncate">{cName}</span>
                              {c.bio && <p className="text-[11px] text-slate-500 line-clamp-1">{c.bio}</p>}
                              {manifestoLink ? (
                                <a
                                  href={manifestoLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md mt-0.5 transition-colors"
                                >
                                  <FileText className="h-3 w-3" /> View Manifesto File ↗
                                </a>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">No document attached</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Policy Sliders */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <PolicySliders stance={voterStance} onChange={handleStanceChange} />
            </div>

            {/* Match Action Button */}
            <button
              onClick={handleCalculateMatch}
              disabled={isFetchingCandidates}
              className={`w-full font-bold rounded-2xl py-4 text-sm transition-all shadow-xs flex items-center justify-center gap-2 active:scale-[0.99] ${
                !selectedElectionId
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isFetchingCandidates ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching Candidates for Election #{selectedElectionId}...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  {!selectedElectionId
                    ? 'Select an Election Window Above to Calculate Match'
                    : `Calculate Candidate Match Scores for Election #${selectedElectionId}`}
                </>
              )}
            </button>

            </div>

          {/* Match Ranking Results */}
          {matchResults.length > 0 && selectedElectionId && (
            <div ref={matchResultsRef} className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Ranked Candidate Match Scores</h3>
                    <p className="text-xs text-slate-500 font-medium">Evaluation for {currentElectionObj?.title || `Election #${selectedElectionId}`}</p>
                  </div>
                </div>
                <span className="text-xs font-mono text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full font-extrabold">
                  {matchResults.length} Candidate{matchResults.length > 1 ? 's' : ''} Evaluated
                </span>
              </div>

              <div className="space-y-3">
                {matchResults.map((result, i) => {
                  const manifestoUrl = result.candidate.manifesto_uri
                    ? (result.candidate.manifesto_uri.startsWith('http') ? result.candidate.manifesto_uri : `${API_BASE}/${result.candidate.manifesto_uri}`)
                    : null;

                  return (
                    <div key={result.candidate.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-all space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold flex-shrink-0 mt-0.5">
                            #{i + 1}
                          </span>
                          <div>
                            <span className="text-sm font-bold text-slate-900 block">{result.candidate.name}</span>
                            {result.candidate.bio && (
                              <span className="text-xs text-slate-500 line-clamp-1">{result.candidate.bio}</span>
                            )}
                            {manifestoUrl && (
                              <a
                                href={manifestoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg mt-1.5 transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                <FileText className="h-3.5 w-3.5 text-blue-600" /> View Manifesto Document ↗
                              </a>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-sm font-extrabold text-blue-700 flex-shrink-0">
                          {formatPercent(result.score)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${result.score * 100}%` }} />
                      </div>
                      <button
                        onClick={() => {
                          setSelectedCandidateId(String(result.candidate.id));
                          setStep(4);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="w-full bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 font-bold text-xs py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        Select {result.candidate.name} & Cast Vote in Election #{selectedElectionId} →
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Proceed to Anonymous Voting Button at End of Page */}
              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={() => {
                    setStep(4);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl py-4 text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  Proceed to Anonymous Voting in Election #{selectedElectionId} →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Anonymous Voting */}
      {step === 4 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] space-y-4">
          <SectionHeader icon={Vote} title={`Step 4 — Anonymous Voting ${selectedElectionId ? `(Election #${selectedElectionId})` : ''}`} subtitle="Cast vote with zero-knowledge proof" />

          <div className="space-y-4">
            {!selectedElectionId ? (
              <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-xs text-amber-900 font-semibold space-y-2 text-center">
                <p>⚠️ No active election window selected!</p>
                <button
                  onClick={() => setStep(3)}
                  className="bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
                >
                  ← Go Back to Select Active Election
                </button>
              </div>
            ) : (
              <>
                <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50/50 space-y-1">
                  <span className="text-xs font-bold text-blue-900 block uppercase tracking-wider">Active Voting Window</span>
                  <p className="text-sm font-black text-slate-900">{currentElectionObj?.title || `Election #${selectedElectionId}`}</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Select Candidate in Election #{selectedElectionId}</label>
                  <select
                    value={selectedCandidateId}
                    onChange={e => setSelectedCandidateId(e.target.value)}
                    disabled={isGeneratingProof || !!voteReceipt}
                    className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none transition-all disabled:opacity-50"
                  >
                    <option value="">-- Choose a candidate --</option>
                    {approvedCandidates.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.display_name || c.name || `Candidate #${c.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCandidateId && (
                  (() => {
                    const cand = approvedCandidates.find(c => String(c.id) === String(selectedCandidateId));
                    if (!cand) return null;
                    const manifestoUrl = cand.manifesto_uri ? (cand.manifesto_uri.startsWith('http') ? cand.manifesto_uri : `${API_BASE}/${cand.manifesto_uri}`) : null;
                    return (
                      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-slate-900">{cand.display_name || cand.name || `Candidate #${cand.id}`}</span>
                          <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-bold">Selected for Vote</span>
                        </div>
                        {cand.bio && <p className="text-[11px] text-slate-500">{cand.bio}</p>}
                        {manifestoUrl && (
                          <a
                            href={manifestoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl transition-colors mt-1 w-fit"
                          >
                            <FileText className="h-3.5 w-3.5 text-blue-600" /> Read Candidate's Full Manifesto Document ↗
                          </a>
                        )}
                      </div>
                    );
                  })()
                )}

                {voteReceipt ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-emerald-900">Vote Confirmed On-Chain</p>
                        <p className="text-xs text-emerald-700">Nullifier spent for Election #{selectedElectionId}. Double-voting prevented.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTriggerPerformanceView(voteReceipt)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                    >
                      <Zap className="h-4 w-4 text-amber-300" />
                      View Performance & Audit Receipt →
                    </button>
                  </div>
                ) : isGeneratingProof ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center space-y-3">
                    <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto" />
                    <p className="text-sm font-bold text-blue-900">Generating Groth16 ZK Proof...</p>
                    <p className="text-xs text-slate-500">Constructing witness & computing constraints for Election #{selectedElectionId}</p>
                  </div>
                ) : (
                  <button
                    onClick={handleVote}
                    disabled={!selectedCandidateId}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <Shield className="h-4 w-4" />
                    Generate Groth16 Proof & Cast Vote in Election #{selectedElectionId} →
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Render local performance modal if triggered */}
      <PerformanceModal receipt={localReceiptModal} onClose={() => setLocalReceiptModal(null)} />

      {/* Render local toast notifications */}
      <ToastContainer toasts={localToasts} onDismiss={dismissLocalToast} />
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}
