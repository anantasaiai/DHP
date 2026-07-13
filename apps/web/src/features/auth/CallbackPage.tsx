import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store.js';
import type { Principal } from '@dhp/types';

interface CallbackResponse {
  access_token: string;
  principal: Principal;
}

/**
 * Handles the OIDC authorization code callback from AuthPlex.
 *
 * The code + PKCE verifier are sent to the Core API (POST /auth/callback),
 * which exchanges them with AuthPlex server-side. The browser never contacts
 * AuthPlex's token endpoint directly.
 *
 * Flow:
 *  1. Validate state (CSRF guard)
 *  2. POST code + verifier to Core API → Core API exchanges with AuthPlex
 *  3. Store access token + principal in Zustand, navigate to /dashboard
 */
export default function CallbackPage(): React.ReactElement {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const returnedState = params.get('state');

      const storedState = sessionStorage.getItem('oidc_state');
      const verifier = sessionStorage.getItem('oidc_verifier');
      sessionStorage.removeItem('oidc_state');
      sessionStorage.removeItem('oidc_verifier');

      if (!code || !verifier) {
        setError('Missing authorization code. Please try signing in again.');
        return;
      }

      if (returnedState !== storedState) {
        setError('State mismatch — possible CSRF. Please try signing in again.');
        return;
      }

      try {
        const apiBase =
          (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ??
          'http://localhost:3000';
        const redirectUri = import.meta.env['VITE_OIDC_REDIRECT_URI'] as string;

        // Token exchange happens server-side — browser never contacts AuthPlex directly
        const res = await fetch(`${apiBase}/auth/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
        });

        if (!res.ok) {
          throw new Error(`Auth callback failed: ${res.status}`);
        }
        const { access_token, principal } = (await res.json()) as CallbackResponse;

        setTokens(access_token, principal);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        console.error('Auth callback error:', err);
        setError('Sign-in failed. Please try again.');
      }
    })();
  }, [navigate, setTokens]);

  if (error) {
    return (
      <div>
        <p>{error}</p>
        <a href="/login">Back to sign-in</a>
      </div>
    );
  }

  return <div>Completing sign-in…</div>;
}
