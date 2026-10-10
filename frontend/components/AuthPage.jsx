import { useState } from 'react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

export function AuthPage({ role = 'voter', initialMode = 'login', onBack, onSuccess, toast }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const roleTitles = {
    admin: 'Admin Portal',
    candidate: 'Candidate Portal',
    voter: 'Voter Gateway',
  };
  const title = roleTitles[role] || 'Portal Access';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const backendRole = role.toUpperCase();
      if (mode === 'signup') {
        try {
          await api.post('/auth/register', {
            email: email.trim(),
            password,
            role: backendRole,
            voter_id: backendRole === 'VOTER' ? 'VTR-1001' : undefined
          });
        } catch (regErr) {
          const regErrMsg = regErr.response?.data?.error || regErr.message || 'Registration failed.';
          if (regErrMsg.toLowerCase().includes('already registered')) {
            throw new Error('This email is already registered. Please switch to "Sign In" or use a different email.');
          }
          throw new Error(regErrMsg);
        }
      }

      // Authenticate with Express Backend API to issue fresh JWT token
      const loginRes = await api.post('/auth/login', {
        email: email.trim(),
        password
      });

      const userEmail = email.trim();
      const userName = fullName.trim() || (loginRes.data?.user?.full_name) || userEmail.split('@')[0];

      if (loginRes.data && loginRes.data.token) {
        sessionStorage.setItem('token', loginRes.data.token);
        sessionStorage.setItem('role', loginRes.data.role || backendRole);
        sessionStorage.setItem('userRole', loginRes.data.role || backendRole);

        localStorage.setItem('token', loginRes.data.token);
        localStorage.setItem('role', loginRes.data.role || backendRole);
        localStorage.setItem('userRole', loginRes.data.role || backendRole);

        const assignedRole = (loginRes.data.role || backendRole).toUpperCase();
        if (assignedRole === 'ADMIN') {
          sessionStorage.setItem('admin_token', loginRes.data.token);
          localStorage.setItem('admin_token', loginRes.data.token);
        } else if (assignedRole === 'CANDIDATE') {
          sessionStorage.setItem('candidate_token', loginRes.data.token);
          localStorage.setItem('candidate_token', loginRes.data.token);
        }
      }
      sessionStorage.setItem('tri_vote_role', role);
      sessionStorage.setItem('tri_vote_user_name', userName);
      sessionStorage.setItem('tri_vote_user_email', userEmail);
      sessionStorage.setItem('userEmail', userEmail);

      localStorage.setItem('tri_vote_role', role);
      localStorage.setItem('tri_vote_user_name', userName);
      localStorage.setItem('tri_vote_user_email', userEmail);
      localStorage.setItem('userEmail', userEmail);
      localStorage.removeItem('candidateId');

      toast && toast('success', mode === 'signup' ? 'Account Created' : 'Signed In', `Welcome, ${userName}!`);
      onSuccess && onSuccess();
    } catch (err) {
      const msg = err.response?.data?.error || (err instanceof Error ? err.message : 'An unexpected error occurred.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f6fc] text-slate-800 flex flex-col items-center justify-center p-4 font-sans relative">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Top Logo matching reference image 2 */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xl shadow-sm">
            +
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            TriVote
          </span>
        </div>

        {/* Portal Title & Subtitle */}
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-1">{title}</h1>
          <p className="text-xs sm:text-sm text-slate-500">Sign in or register to access your account</p>
        </div>

        {/* Tab Switcher matching reference image 2 */}
        <div className="w-full bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs mb-6 flex gap-1">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              mode === 'login'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null); }}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              mode === 'signup'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Register
          </button>
        </div>

        {/* Form Card matching reference image 2 */}
        <div className="w-full bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-[0_4px_25px_-2px_rgba(0,0,0,0.03)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  disabled={loading}
                  required
                  className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                  placeholder="John Doe"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Email Address *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                required
                className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                placeholder="user@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Password *</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                required
                className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                placeholder="Your password"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-600 font-medium">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : mode === 'signup' ? (
                'Register Account →'
              ) : (
                'Sign In →'
              )}
            </button>
          </form>

          <div className="text-center mt-5 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {mode === 'signup' ? 'Already have an account?' : 'No account yet?'}{' '}
              <button
                type="button"
                onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null); }}
                disabled={loading}
                className="text-blue-600 font-bold hover:underline transition-colors ml-1"
              >
                {mode === 'signup' ? 'Sign In →' : 'Register →'}
              </button>
            </p>
          </div>
        </div>

        {/* Back to Home Link */}
        <button
          onClick={onBack}
          disabled={loading}
          className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Home
        </button>
      </div>
    </div>
  );
}
