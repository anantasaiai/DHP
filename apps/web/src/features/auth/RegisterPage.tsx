import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store.js';
import type { Principal } from '@dhp/types';

const AUTHPLEX_URL = (import.meta.env['VITE_OIDC_ISSUER'] as string | undefined) ?? 'http://localhost:8080';
const TENANT_ID = (import.meta.env['VITE_AUTHPLEX_TENANT_ID'] as string | undefined) ?? '';
const API_BASE = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? 'http://localhost:3000';

interface LoginResponse {
  access_token: string;
  principal: Principal;
}

export default function RegisterPage(): React.ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setTokens = useAuthStore((s) => s.setTokens);

  const prefillEmail = searchParams.get('email') ?? '';
  const redirect = searchParams.get('redirect') ?? '/dashboard';
  const isFromInvite = redirect.includes('/invites/');

  const [name, setName] = useState('');
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep email in sync if query param changes
  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail);
  }, [prefillEmail]);

  const passwordsMatch = password === confirm;
  const canSubmit = name.trim() && email.trim() && password.length >= 8 && passwordsMatch;

  if (!isFromInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Invitation required</h2>
          <p className="text-slate-500 text-sm mb-4">
            DHP Health is invite-only. You can only create an account using the link in your invitation email.
          </p>
          <p className="text-slate-400 text-xs mb-6">
            If you should have access, ask your organization admin to send you an invite.
          </p>
          <a
            href="/login"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      // Step 1 — create account in AuthPlex
      const regRes = await fetch(`${AUTHPLEX_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': TENANT_ID,
        },
        body: JSON.stringify({ email: email.toLowerCase().trim(), password, name }),
      });

      if (!regRes.ok) {
        const body = await regRes.json().catch(() => ({})) as Record<string, unknown>;
        const msg = (body as { error?: { message?: string } }).error?.message
          ?? (body as { message?: string }).message
          ?? 'Registration failed.';
        setError(msg);
        return;
      }

      // Step 2 — login to DHP to get JWT + principal
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!loginRes.ok) {
        // Account created but login failed — most likely no org membership yet,
        // which is expected before invite accept. Still, tell user to proceed.
        setError('Account created but could not sign in automatically. Please sign in manually.');
        navigate(`/login?redirect=${encodeURIComponent(redirect)}`);
        return;
      }

      const { access_token, principal } = (await loginRes.json()) as LoginResponse;
      setTokens(access_token, principal);
      navigate(redirect, { replace: true });
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight">DHP Health</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            Join your team<br />on DHP Health.
          </h1>
          <p className="text-blue-100 text-lg leading-relaxed">
            Create your account to manage appointments, availability, and patient bookings.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            {['Secure Access', 'Role-Based', 'Real-time Scheduling', 'HIPAA Ready'].map((f) => (
              <span key={f} className="px-3 py-1.5 bg-white/15 rounded-full text-sm font-medium backdrop-blur-sm">
                {f}
              </span>
            ))}
          </div>
        </div>

        <p className="text-blue-200 text-sm">
          Trusted by healthcare teams to keep patients and doctors in sync.
        </p>
      </div>

      {/* Right panel — registration form */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 sm:px-12 lg:px-16 bg-slate-50">
        <div className="flex items-center gap-2 mb-10 lg:hidden">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-800">DHP Health</span>
        </div>

        <div className="w-full max-w-sm mx-auto lg:mx-0">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Create your account</h2>
            <p className="text-slate-500 mt-1 text-sm">
              Already have one?{' '}
              <a href={`/login?redirect=${encodeURIComponent(redirect)}`} className="text-blue-600 hover:underline">
                Sign in
              </a>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Dr. Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="doctor@hospital.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!!prefillEmail}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-slate-50 disabled:text-slate-500"
              />
              {prefillEmail && (
                <p className="text-xs text-slate-400">Email is fixed to match your invite.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className={`w-full px-3.5 py-2.5 rounded-lg border bg-white text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                  confirm && !passwordsMatch ? 'border-red-400' : 'border-slate-300'
                }`}
              />
              {confirm && !passwordsMatch && (
                <p className="text-xs text-red-500">Passwords do not match.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} DHP Health · Secure Hospital Portal
          </p>
        </div>
      </div>
    </div>
  );
}
