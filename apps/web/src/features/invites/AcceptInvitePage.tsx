import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store.js';

const API_BASE = '/api/v1';

interface InvitePreview {
  invitedEmail: string;
  role: string;
  organizationId: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MAINTAINER: 'Doctor / Staff',
  MEMBER: 'Member',
};

export default function AcceptInvitePage(): React.ReactElement {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const principal = useAuthStore((s) => s.principal);

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );

  // Load invite preview
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/organizations/invites/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Invite not found or already used.');
        return r.json() as Promise<InvitePreview>;
      })
      .then(setPreview)
      .catch((e: Error) => setLoadError(e.message));
  }, [token]);

  // Pre-fill username from email prefix when preview loads
  useEffect(() => {
    if (preview && !username) {
      setUsername(preview.invitedEmail.split('@')[0] ?? '');
    }
  }, [preview, username]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!principal) {
      navigate(`/register?email=${encodeURIComponent(preview?.invitedEmail ?? '')}&redirect=/invites/${token}/accept`);
      return;
    }
    setAccepting(true);
    setAcceptError(null);
    try {
      const res = await fetch(`${API_BASE}/organizations/invites/${token}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ''}`,
        },
        body: JSON.stringify({
          acceptingUserId: principal.userId,
          acceptingEmail: preview?.invitedEmail,
          username,
          timezone,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Failed to accept invite.');
      }
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setAcceptError((e as Error).message);
    } finally {
      setAccepting(false);
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Invite unavailable</h2>
          <p className="text-slate-500 text-sm">{loadError}</p>
          <p className="text-slate-400 text-xs mt-3">This link may have already been used or expired. Contact your admin for a new invite.</p>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">Loading invite…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md w-full">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-800">DHP Health</span>
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-1">You've been invited</h2>
        <p className="text-slate-500 text-sm mb-6">
          Join as a <strong>{ROLE_LABELS[preview.role] ?? preview.role}</strong> at{' '}
          <strong>{preview.invitedEmail.split('@')[1]}</strong>
        </p>

        {!principal && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-800">
            You need to sign in first before accepting this invite.
          </div>
        )}

        <form onSubmit={handleAccept} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="text"
              value={preview.invitedEmail}
              disabled
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Display name</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="e.g. dr.smith"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {acceptError && (
            <p className="text-sm text-red-600">{acceptError}</p>
          )}

          {principal ? (
            <button
              type="submit"
              disabled={accepting || !username.trim()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {accepting ? 'Accepting…' : 'Accept Invitation'}
            </button>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => navigate(`/register?email=${encodeURIComponent(preview.invitedEmail)}&redirect=/invites/${token}/accept`)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Create account &amp; Accept
              </button>
              <button
                type="button"
                onClick={() => navigate(`/login?redirect=/invites/${token}/accept`)}
                className="w-full py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Already have an account? Sign in
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
