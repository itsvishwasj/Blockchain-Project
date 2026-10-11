import { useState, useEffect } from 'react';
import { CandidateTab } from '@/components/CandidateTab';
import { ToastContainer } from '@/components/Toast';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ArrowLeft, User } from 'lucide-react';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function CandidateDashboardPage() {
  const [userProfile, setUserProfile] = useState(null);
  const [toasts, setToasts] = useState([]);
  const addToast = (type, title, message) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, title, message }]);
  };
  const dismissToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    async function loadMe() {
      if (typeof window === 'undefined') return;
      const savedEmail = localStorage.getItem('tri_vote_user_email') || localStorage.getItem('userEmail');
      const savedName = localStorage.getItem('tri_vote_user_name');
      if (savedEmail || savedName) {
        setUserProfile({
          full_name: savedName || (savedEmail ? savedEmail.split('@')[0] : 'Candidate'),
          email: savedEmail || ''
        });
      }
      try {
        const { data } = await api.get('/auth/me');
        if (data && data.email) {
          setUserProfile({
            full_name: data.full_name || data.email.split('@')[0],
            email: data.email
          });
        }
      } catch (e) {}
    }
    loadMe();
  }, []);

  const displayName = userProfile?.full_name || (userProfile?.email ? userProfile.email.split('@')[0] : 'Candidate');
  const initial = (displayName?.[0] || 'C').toUpperCase();

  return (
    <div className="min-h-screen bg-[#f3f6fc] text-slate-800 font-sans flex flex-col">
      {/* Light Top Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-lg shadow-sm">
              +
            </Link>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 leading-none">Candidate Portal</h1>
              <p className="text-[11px] text-slate-500 mt-0.5">Candidate Registration &amp; Cryptographic Attestation</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {userProfile && (
              <div className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50/70 px-3 py-1 text-xs">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-600 text-white font-bold text-[11px]">
                  {initial}
                </div>
                <div className="text-left leading-tight hidden sm:block">
                  <span className="font-extrabold text-purple-950 block">{displayName}</span>
                  <span className="font-mono text-[10px] text-purple-700 block">{userProfile.email}</span>
                </div>
              </div>
            )}
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-xl transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 mx-auto max-w-6xl px-4 sm:px-6 py-6 w-full">
        <CandidateTab toast={addToast} />
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}