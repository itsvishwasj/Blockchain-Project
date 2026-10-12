import { useState, useEffect } from 'react';
import { LandingPage } from '@/components/LandingPage';
import { AuthPage } from '@/components/AuthPage';
import { Dashboard } from '@/components/Dashboard';
import { api } from '@/lib/api';

export default function Home() {
  const [view, setView] = useState('landing'); // 'landing' | 'auth' | 'dashboard'
  const [selectedRole, setSelectedRole] = useState('voter');
  const [authInitialMode, setAuthInitialMode] = useState('login');
  const [profile, setProfile] = useState({ full_name: 'Demo User', email: 'user@tri-vote.dev' });

  // Toast state
  const [toasts, setToasts] = useState([]);
  const addToast = (type, title, message) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, title, message }]);
  };
  const dismissToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Election State
  const [election, setElection] = useState({
    title: '2026 Municipal General Election',
    startTime: '2026-10-09T09:00',
    endTime: '2026-10-10T18:00',
    whitelistLoaded: true,
    registrationLocked: false,
    merkleRoot: null,
    votingOpen: false,
  });

  // Candidates State
  const [candidates, setCandidates] = useState([
    {
      id: 'cand_1',
      name: 'Udupa',
      bio: 'Former Treasury Director & Policy Lead',
      manifesto: 'Promoting transparent municipal governance through Poseidon zk-SNARKs and real-time public ledger attestation.',
      manifestoHash: '0xa7f9b8c3d2e1045938561ab902784efc89327b0192847596a0129384bcde981a',
      status: 'approved',
      stance: { economy: 0.85, environment: 0.70, healthcare: 0.80, education: 0.90, civilRights: 0.85, security: 0.65 },
    },
    {
      id: 'cand_2',
      name: 'Rohan Sharma',
      bio: 'Environmental Engineer & Urban Sustainability Scholar',
      manifesto: 'Pioneering green energy microgrids and zero-emission municipal infrastructure backed by audited smart contracts.',
      manifestoHash: '0x3b89e2194058ac89f0128495bcdae7619284950182749502918237495a019284',
      status: 'approved',
      stance: { economy: 0.50, environment: 0.95, healthcare: 0.75, education: 0.80, civilRights: 0.70, security: 0.40 },
    }
  ]);

  // Voters State
  const [voters, setVoters] = useState([
    { id: 'v1', voterId: 'VTR-1001', email: 'alice@tri-vote.dev', commitment: '0x7a89b0123456789abcdef0123456789abcdef0123456789abcdef0123456789a', hasVoted: false },
    { id: 'v2', voterId: 'VTR-1002', email: 'bob@tri-vote.dev', commitment: '0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c', hasVoted: false },
    { id: 'v3', voterId: 'VTR-1003', email: 'charlie@tri-vote.dev', commitment: '0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e', hasVoted: false }
  ]);

  // Performance Modal Receipt State
  const [performanceReceipt, setPerformanceReceipt] = useState(null);

  // Restore active user session & load authentic user profile from backend on mount/refresh
  useEffect(() => {
    async function restoreAndFetchProfile() {
      if (typeof window === 'undefined') return;
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const savedRole = localStorage.getItem('userRole') || localStorage.getItem('role') || localStorage.getItem('tri_vote_role');
      const savedName = localStorage.getItem('tri_vote_user_name') || sessionStorage.getItem('tri_vote_user_name');
      const savedEmail = localStorage.getItem('tri_vote_user_email') || localStorage.getItem('userEmail') || sessionStorage.getItem('tri_vote_user_email');

      if (savedRole) {
        setSelectedRole(savedRole.toLowerCase());
      }

      if (savedName || savedEmail) {
        setProfile({
          full_name: savedName || (savedEmail ? savedEmail.split('@')[0] : 'Registered User'),
          email: savedEmail || (savedRole ? `${savedRole.toLowerCase()}@tri-vote.dev` : 'user@tri-vote.dev')
        });
      }

      if (token) {
        try {
          const { data } = await api.get('/auth/me');
          if (data && data.email) {
            const displayName = data.full_name || data.email.split('@')[0];
            setProfile({
              full_name: displayName,
              email: data.email,
              role: data.role,
              voter_id: data.voter_id
            });
            localStorage.setItem('tri_vote_user_name', displayName);
            localStorage.setItem('tri_vote_user_email', data.email);
            localStorage.setItem('userEmail', data.email);
            sessionStorage.setItem('tri_vote_user_name', displayName);
            sessionStorage.setItem('tri_vote_user_email', data.email);
          }
        } catch (err) {
          console.log('User profile fetch note:', err.message);
        }
      }
    }

    restoreAndFetchProfile();
  }, []);

  // Sync with Backend API on mount if available
  useEffect(() => {
    async function loadBackendData() {
      try {
        const res = await api.get('/admin/elections');
        if (res.data && res.data.data && res.data.data.length > 0) {
          const active = res.data.data[0];
          setElection(prev => ({
            ...prev,
            title: active.title || prev.title,
            registrationLocked: active.status === 'REGISTRATION_LOCKED' || active.status === 'VOTING_OPEN',
            votingOpen: active.status === 'VOTING_OPEN',
            merkleRoot: active.merkleRoot || prev.merkleRoot
          }));
        }
      } catch (err) {
        // Fall back gracefully to local state
      }
    }
    loadBackendData();
  }, []);

  // Handlers
  const handleSelectPortal = (role) => {
    if (role === 'results') {
      window.location.href = '/results';
      return;
    }
    if (role === 'voter' && typeof window !== 'undefined') {
      window.location.href = '/voter';
      return;
    }
    setSelectedRole(role);
    setAuthInitialMode('login');
    setView('auth');
    if (typeof window !== 'undefined') {
      const targetUrl = `/${role}/dashboard`;
      window.history.pushState({}, '', targetUrl);
    }
  };

  const handleElectionChange = (patch) => {
    setElection(prev => ({ ...prev, ...patch }));
    addToast('info', 'Election Parameters Saved', 'Updated election title and dates.');
  };

  const handleLoadWhitelist = () => {
    setElection(prev => ({ ...prev, whitelistLoaded: true }));
    addToast('success', 'Whitelist Loaded', 'Loaded sample voter whitelist.');
  };

  const handleApproveCandidate = (id) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, status: 'approved' } : c));
    addToast('success', 'Candidate Approved', 'Candidate manifesto attested and approved.');
  };

  const handleGenerateMerkleRoot = () => {
    const merkleRoot = '0x4f829a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f';
    setElection(prev => ({ ...prev, merkleRoot, registrationLocked: true }));
    addToast('success', 'Merkle Root Locked', 'Voter commitment tree locked on-chain.');
  };

  const handleOpenVoting = () => {
    setElection(prev => ({ ...prev, votingOpen: true }));
    addToast('success', 'Blockchain Voting Live', 'State machine updated to VOTING_OPEN.');
  };

  const handleSubmitCandidate = (data) => {
    const newCand = {
      id: 'cand_' + (candidates.length + 1),
      ...data,
      status: 'pending',
    };
    setCandidates(prev => [...prev, newCand]);
  };

  const handleCommitIdentity = (voterId, email, commitment, nullifier) => {
    setVoters(prev => {
      const idx = prev.findIndex(v => v.voterId === voterId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], commitment, nullifier };
        return copy;
      }
      return [...prev, { id: 'v_' + Date.now(), voterId, email, commitment, nullifier, hasVoted: false }];
    });
  };

  const handleVote = (voterId, candidateId, receipt) => {
    setVoters(prev => prev.map(v => v.voterId === voterId ? { ...v, hasVoted: true } : v));
  };

  // Sign out redirecting directly to main landing page as requested!
  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('userRole');
      localStorage.removeItem('candidateId');
      localStorage.removeItem('tri_vote_user');
      localStorage.removeItem('tri_vote_role');
      localStorage.removeItem('tri_vote_user_name');
      window.history.pushState({}, '', '/');
    }
    setProfile(null);
    setView('landing');
    addToast('info', 'Signed Out', 'Redirected to main landing page.');
  };

  if (view === 'landing') {
    return <LandingPage onSelectPortal={handleSelectPortal} />;
  }

  if (view === 'auth') {
    return (
      <AuthPage
        role={selectedRole}
        initialMode={authInitialMode}
        onBack={() => {
          setView('landing');
          if (typeof window !== 'undefined') window.history.pushState({}, '', '/');
        }}
        onSuccess={() => {
          const userName = typeof window !== 'undefined' ? localStorage.getItem('tri_vote_user_name') : 'User';
          setProfile({
            full_name: userName || selectedRole.toUpperCase() + ' User',
            email: `${selectedRole}@tri-vote.dev`
          });
          setView('dashboard');
          if (typeof window !== 'undefined') {
            const targetUrl = selectedRole === 'voter' ? '/voter/vote' : `/${selectedRole}/dashboard`;
            window.history.pushState({}, '', targetUrl);
          }
        }}
        toast={addToast}
      />
    );
  }

  return (
    <Dashboard
      role={selectedRole}
      profile={profile}
      election={election}
      candidates={candidates}
      voters={voters}
      toasts={toasts}
      onElectionChange={handleElectionChange}
      onLoadWhitelist={handleLoadWhitelist}
      onApproveCandidate={handleApproveCandidate}
      onGenerateMerkleRoot={handleGenerateMerkleRoot}
      onOpenVoting={handleOpenVoting}
      onSubmitCandidate={handleSubmitCandidate}
      onCommitIdentity={handleCommitIdentity}
      onVote={handleVote}
      onViewPerformance={setPerformanceReceipt}
      onDismissToast={dismissToast}
      onClosePerformance={() => setPerformanceReceipt(null)}
      performanceReceipt={performanceReceipt}
      onSignOut={handleSignOut}
      toast={addToast}
    />
  );
}
