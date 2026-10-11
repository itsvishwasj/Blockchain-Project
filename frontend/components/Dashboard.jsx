import { AdminTab } from '@/components/AdminTab';
import { CandidateTab } from '@/components/CandidateTab';
import { VoterTab } from '@/components/VoterTab';
import { PerformanceModal } from '@/components/PerformanceModal';
import { ToastContainer } from '@/components/Toast';
import {
  ShieldCheck,
  FileText,
  Vote as VoteIcon,
  LogOut,
  ChevronDown,
  ArrowLeft,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useState, useEffect } from 'react';

export function Dashboard(props) {
  const {
    role = 'voter',
    profile,
    election = {},
    candidates = [],
    voters = [],
    performanceReceipt: externalPerformanceReceipt,
    toasts = [],
  } = props;
  const [localProfile, setLocalProfile] = useState(null);

  useEffect(() => {
    async function fetchMe() {
      if (typeof window === 'undefined') return;
      const savedName = localStorage.getItem('tri_vote_user_name') || sessionStorage.getItem('tri_vote_user_name');
      const savedEmail = localStorage.getItem('tri_vote_user_email') || localStorage.getItem('userEmail') || sessionStorage.getItem('tri_vote_user_email');

      if (savedName || savedEmail) {
        setLocalProfile({
          full_name: savedName || (savedEmail ? savedEmail.split('@')[0] : 'User'),
          email: savedEmail || ''
        });
      }

      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (token) {
        try {
          const { api } = await import('@/lib/api');
          const { data } = await api.get('/auth/me');
          if (data && data.email) {
            const displayName = data.full_name || data.email.split('@')[0];
            setLocalProfile({
              full_name: displayName,
              email: data.email,
              role: data.role
            });
            localStorage.setItem('tri_vote_user_name', displayName);
            localStorage.setItem('tri_vote_user_email', data.email);
            localStorage.setItem('userEmail', data.email);
            sessionStorage.setItem('tri_vote_user_name', displayName);
            sessionStorage.setItem('tri_vote_user_email', data.email);
            sessionStorage.setItem('userEmail', data.email);
          }
        } catch (e) {}
      }
    }
    fetchMe();
  }, [profile]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [localPerformanceReceipt, setLocalPerformanceReceipt] = useState(null);

  const activePerformanceReceipt = externalPerformanceReceipt || localPerformanceReceipt;

  const handleViewPerformance = (receipt) => {
    if (typeof props.onViewPerformance === 'function') {
      props.onViewPerformance(receipt);
    }
    setLocalPerformanceReceipt(receipt);
  };

  const handleClosePerformance = () => {
    if (typeof props.onClosePerformance === 'function') {
      props.onClosePerformance();
    }
    setLocalPerformanceReceipt(null);
  };

  const roleConfig = {
    admin: { icon: ShieldCheck, label: 'Admin Module', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    candidate: { icon: FileText, label: 'Candidate Module', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
    voter: { icon: VoteIcon, label: 'Voter Gateway', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };
  const config = roleConfig[role] || roleConfig.voter;
  const RoleIcon = config.icon;

  const isDemoProfile = profile?.email && profile.email.includes('user@tri-vote.dev');
  const activeProfile = localProfile || (!isDemoProfile ? profile : null) || { full_name: 'User', email: '' };
  const displayName = activeProfile.full_name || (activeProfile.email ? activeProfile.email.split('@')[0] : 'User');
  const initial = (displayName?.[0] || activeProfile.email?.[0] || 'U').toUpperCase();

  return (
    <div className="min-h-screen bg-[#f3f6fc] text-slate-800 flex flex-col font-sans">
      {/* Light Top Bar */}
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand logo & title */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-lg shadow-sm">
              +
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900 block leading-none">
                TriVote
              </span>
              <span className="text-[10px] font-medium text-slate-400 block mt-0.5">
                Zero-Knowledge E-Voting System
              </span>
            </div>
          </div>

          {/* User profile / Back to Home navigation action */}
          <div className="relative flex items-center gap-3">
            <ThemeToggle />
            {role === 'voter' ? (
              <a
                href="/"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 font-bold text-xs transition-all shadow-2xs"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-slate-600" />
                <span>Back to Home</span>
              </a>
            ) : (
              <>
                <a
                  href="/voter"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs transition-all shadow-2xs"
                >
                  <VoteIcon className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Voter Portal (/voter)</span>
                </a>

                <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${config.badge}`}>
                  <RoleIcon className="h-3.5 w-3.5" />
                  <span>{config.label}</span>
                </div>

                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-black shadow-xs flex-shrink-0">
                    {initial}
                  </div>
                  <div className="text-left hidden sm:block leading-tight">
                    <span className="text-xs font-extrabold text-slate-900 block">
                      {displayName}
                    </span>
                    {activeProfile.email && (
                      <span className="text-[10px] font-mono text-slate-500 block truncate max-w-[140px]">
                        {activeProfile.email}
                      </span>
                    )}
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-12 w-64 rounded-2xl border border-slate-100 bg-white shadow-xl z-50 overflow-hidden animate-fade-in-up p-1">
                      <div className="px-3.5 py-3 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
                        <p className="text-xs font-extrabold text-slate-900 truncate">{displayName}</p>
                        <p className="text-[11px] font-mono text-blue-700 truncate mt-0.5">{activeProfile.email || 'Registered User'}</p>
                        <span className="inline-block text-[10px] font-bold text-slate-600 uppercase tracking-wider bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md mt-1.5">
                          Role: {role.toUpperCase()}
                        </span>
                      </div>
                      <a
                        href="/voter"
                        className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors w-full mt-1"
                      >
                        <VoteIcon className="h-4 w-4 text-emerald-600" />
                        Go to Voter Portal (/voter)
                      </a>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          if (typeof props.onSignOut === 'function') {
                            props.onSignOut();
                          } else {
                            localStorage.removeItem('token');
                            localStorage.removeItem('role');
                            localStorage.removeItem('userRole');
                            localStorage.removeItem('admin_token');
                            localStorage.removeItem('candidate_token');
                            localStorage.removeItem('tri_vote_user_name');
                            localStorage.removeItem('tri_vote_user_email');
                            localStorage.removeItem('userEmail');
                            sessionStorage.clear();
                            window.location.href = '/';
                          }
                        }}
                        className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors w-full mt-1 cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out to Landing Page
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 mx-auto max-w-6xl px-4 sm:px-6 py-6 w-full">
        {/* Active Tab View */}
        {role === 'admin' && (
          <AdminTab
            election={election}
            candidates={candidates}
            voters={voters}
            onElectionChange={props.onElectionChange}
            onLoadWhitelist={props.onLoadWhitelist}
            onApproveCandidate={props.onApproveCandidate}
            onGenerateMerkleRoot={props.onGenerateMerkleRoot}
            onOpenVoting={props.onOpenVoting}
            toast={props.toast}
          />
        )}
        {role === 'candidate' && (
          <CandidateTab
            onSubmit={props.onSubmitCandidate}
            registrationLocked={election.registrationLocked}
            toast={props.toast}
          />
        )}
        {role === 'voter' && (
          <VoterTab
            election={election}
            candidates={candidates}
            voters={voters}
            onCommitIdentity={props.onCommitIdentity}
            onVote={props.onVote}
            onViewPerformance={handleViewPerformance}
            toast={props.toast}
          />
        )}
      </main>

      {/* Light Footer */}
      <footer className="mx-auto max-w-6xl px-4 sm:px-6 py-6 text-center text-xs text-slate-400 border-t border-slate-200/60 w-full mt-8">
        Tri-Modular E-Voting Architecture · Poseidon ZK Proof · Groth16 Verifier
      </footer>

      {/* Modals & Toasts */}
      <PerformanceModal receipt={activePerformanceReceipt} onClose={handleClosePerformance} />
      <ToastContainer toasts={toasts} onDismiss={props.onDismissToast} />
    </div>
  );
}
