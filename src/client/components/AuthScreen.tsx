import React, { useEffect, useState } from 'react';
import { ArrowRight, KeyRound, Lock, Mail, ShieldCheck, Ticket, UserPlus } from 'lucide-react';
import { api, setAuthToken, type AuthContext } from '../lib/api.ts';

interface AuthScreenProps {
  sessionNotice?: string;
  onAuthenticated: (ctx: AuthContext) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ sessionNotice, onAuthenticated }) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'invite' | 'forgot' | 'reset'>('signin');
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api
      .getAuthStatus()
      .then((res) => {
        setInitialized(res.initialized);
        if (!res.initialized) {
          setMode('signup');
        }
      })
      .catch(() => setInitialized(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        const res = await api.login(email, password);
        setAuthToken(res.token, res.context.organization.id);
        onAuthenticated(res.context);
      } else if (mode === 'signup') {
        const res = await api.register({ name, email, password, organizationName });
        setAuthToken(res.token, res.context.organization.id);
        onAuthenticated(res.context);
      } else if (mode === 'invite') {
        const res = await api.acceptInvite({ token: inviteToken, name, password });
        setAuthToken(res.token, res.context.organization.id);
        onAuthenticated(res.context);
      } else if (mode === 'forgot') {
        const res = await api.forgotPassword(email);
        setNotice(
          res.resetToken
            ? `${res.message} Copy reset token: ${res.resetToken}`
            : res.message
        );
        if (res.resetToken) {
          setResetToken(res.resetToken);
          setMode('reset');
        }
      } else if (mode === 'reset') {
        const res = await api.resetPassword(resetToken, password);
        setNotice(res.message);
        setPassword('');
        setMode('signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen colakin-dot-canvas flex flex-col justify-center py-6 sm:py-10 px-4 sm:px-6">
      <div className="max-w-lg w-full mx-auto bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 shadow-sm">
        {/* Brand Lockup: Colakin on top, DeX sub-brand nearby below */}
        <div className="flex flex-col items-start gap-2 pb-5 border-b border-slate-100">
          <img
            src="/assets/images/companylogo1_5f78dfc9.png"
            alt="Colakin"
            className="h-8 sm:h-9 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
          <div className="flex items-center gap-2 pl-0.5">
            <img
              src="/assets/images/companylogo2_754b2368.png"
              alt="DeX"
              className="h-5 sm:h-6 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="text-xs font-medium text-slate-500">
              Marketing Operations Platform
            </span>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#0A2472] tracking-tight">
              {mode === 'signin' && 'Sign in to your workspace'}
              {mode === 'signup' && (initialized === false ? 'Create your owner workspace' : 'Create an organization')}
              {mode === 'invite' && 'Accept team invitation'}
              {mode === 'forgot' && 'Reset your password'}
              {mode === 'reset' && 'Set a new password'}
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D63ED] bg-[#EAF1FF] px-2.5 py-1 rounded-md shrink-0">
              <ShieldCheck className="w-3.5 h-3.5" />
              Live JWT
            </span>
          </div>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-600">
            {initialized === false && mode === 'signup'
              ? 'First-run setup: create your organization owner account to start with a clean workspace.'
              : 'Real-time HS256 JWT verification protects every workspace and session.'}
          </p>
        </div>

        {sessionNotice && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900">
            {sessionNotice}
          </div>
        )}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs sm:text-sm text-[#0A2472] break-all">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {(mode === 'signup' || mode === 'invite') && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D63ED]"
              />
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Organization / Agency Name</label>
              <input
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Your company name"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D63ED]"
              />
            </div>
          )}

          {mode === 'invite' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Invitation Token</label>
              <div className="relative">
                <Ticket className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  required
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  placeholder="Paste team invitation token"
                  className="w-full min-h-[44px] pl-9 pr-3.5 py-2.5 text-base sm:text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D63ED]"
                />
              </div>
            </div>
          )}

          {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Work Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full min-h-[44px] pl-9 pr-3.5 py-2.5 text-base sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D63ED]"
                />
              </div>
            </div>
          )}

          {mode === 'reset' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reset Token</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste reset token"
                  className="w-full min-h-[44px] pl-9 pr-3.5 py-2.5 text-base sm:text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D63ED]"
                />
              </div>
            </div>
          )}

          {(mode === 'signin' || mode === 'signup' || mode === 'invite' || mode === 'reset') && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {mode === 'reset' ? 'New Password (min 8 chars)' : 'Password'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="password"
                  required
                  minLength={mode === 'signin' ? 6 : 8}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] pl-9 pr-3.5 py-2.5 text-base sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D63ED]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] py-2.5 px-4 bg-[#1D63ED] hover:bg-[#1752C9] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            <span>
              {loading
                ? 'Verifying JWT...'
                : mode === 'signin'
                  ? 'Sign In & Verify JWT'
                  : mode === 'signup'
                    ? 'Create Organization & Start'
                    : mode === 'invite'
                      ? 'Join Organization'
                      : mode === 'forgot'
                        ? 'Request Reset Token'
                        : 'Update Password'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          {mode === 'signin' ? (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="font-medium text-[#1D63ED] hover:underline flex items-center gap-1 py-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Create Organization
                </button>
                <button
                  type="button"
                  onClick={() => setMode('invite')}
                  className="font-medium text-slate-700 hover:text-[#1D63ED] hover:underline py-1 cursor-pointer"
                >
                  Join via Invite
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="hover:text-slate-900 hover:underline py-1 cursor-pointer"
              >
                Forgot password?
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="font-medium text-[#1D63ED] hover:underline py-1 cursor-pointer"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
