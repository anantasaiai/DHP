import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store.js';
import type { Principal } from '@dhp/types';

const AUTHPLEX_URL = (import.meta.env['VITE_OIDC_ISSUER'] as string | undefined) ?? 'http://localhost:8080';
const TENANT_ID = (import.meta.env['VITE_AUTHPLEX_TENANT_ID'] as string | undefined) ?? '';
const API_BASE = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? 'http://localhost:3000';

interface LoginResponse {
  access_token: string;
  principal: Principal;
}

type Step = 'checking' | 'blocked' | 'form' | 'done';

export default function SetupPage(): React.ReactElement {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);

  const [step, setStep] = useState<Step>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Account fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // Org fields
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/organizations/setup/status`)
      .then((r) => r.json() as Promise<{ setupRequired: boolean }>)
      .then(({ setupRequired }) => setStep(setupRequired ? 'form' : 'blocked'))
      .catch(() => setStep('blocked'));
  }, []);

  // Auto-generate slug from org name
  useEffect(() => {
    setOrgSlug(
      orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48),
    );
  }, [orgName]);

  const passwordsMatch = password === confirm;
  const canSubmit =
    name.trim() &&
    email.trim() &&
    password.length >= 8 &&
    passwordsMatch &&
    orgName.trim() &&
    orgSlug.length >= 2;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Create AuthPlex account
      const regRes = await fetch(`${AUTHPLEX_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT_ID },
        body: JSON.stringify({ email: email.toLowerCase().trim(), password, name }),
      });
      if (!regRes.ok) {
        const body = await regRes.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
        throw new Error(body.error?.message ?? body.message ?? 'Registration failed.');
      }

      // 2. Login to get JWT
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!loginRes.ok) throw new Error('Account created but login failed. Please sign in manually.');
      const { access_token, principal } = (await loginRes.json()) as LoginResponse;
      setTokens(access_token, principal);

      // 3. Rename the auto-provisioned org with the real name + slug
      const orgRes = await fetch(`${API_BASE}/api/v1/organizations/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
        body: JSON.stringify({ name: orgName, slug: orgSlug }),
      });
      if (!orgRes.ok) {
        const body = await orgRes.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Failed to update organization.');
      }

      // 4. Re-login so principal picks up the new org membership
      const reloginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (reloginRes.ok) {
        const { access_token: newToken, principal: newPrincipal } = (await reloginRes.json()) as LoginResponse;
        setTokens(newToken, newPrincipal);
      }

      navigate('/org/dashboard', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (step === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">Checking setup status…</div>
      </div>
    );
  }

  if (step === 'blocked') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Setup already complete</h2>
          <p className="text-slate-500 text-sm mb-6">
            An organization already exists. New users join via invitation only.
          </p>
          <a href="/login" className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
            Sign In
          </a>
        </div>
      </div>
    );
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
          <h1 className="text-4xl font-bold leading-tight">First-time<br />setup.</h1>
          <p className="text-blue-100 text-lg leading-relaxed">
            Create your admin account and organization. All other users will be invited by you.
          </p>
        </div>
        <p className="text-blue-200 text-sm">This page is only available before any organization is created.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 sm:px-12 lg:px-16 bg-slate-50">
        <div className="w-full max-w-sm mx-auto lg:mx-0">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Create admin account</h2>
            <p className="text-slate-500 mt-1 text-sm">You will be the first admin of your organization.</p>
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

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Your Account</p>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="name">Full name</label>
              <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required
                placeholder="Dr. Jane Smith"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="email">Email address</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="admin@hospital.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={8} placeholder="Min. 8 characters"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="confirm">Confirm password</label>
              <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                required placeholder="Repeat password"
                className={`w-full px-3.5 py-2.5 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${confirm && !passwordsMatch ? 'border-red-400' : 'border-slate-300'}`} />
              {confirm && !passwordsMatch && <p className="text-xs text-red-500">Passwords do not match.</p>}
            </div>

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-2">Your Organization</p>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="orgName">Organization name</label>
              <input id="orgName" type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} required
                placeholder="City General Hospital"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="orgSlug">URL slug</label>
              <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                <span className="px-3 py-2.5 text-slate-400 text-sm border-r border-slate-200 bg-slate-50 shrink-0">dhp.app/</span>
                <input id="orgSlug" type="text" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} required
                  minLength={2} maxLength={48} placeholder="city-general"
                  className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent" />
              </div>
            </div>

            <button type="submit" disabled={loading || !canSubmit}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Setting up…
                </>
              ) : 'Create account & organization'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
