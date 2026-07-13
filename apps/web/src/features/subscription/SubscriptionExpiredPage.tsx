import React from 'react';
import { useAuthStore } from '../../store/auth.store.js';

/**
 * §7A.4a — shown when the API returns 402 Payment Required.
 *
 * This is a distinct state from 401 (unauthenticated) and 403 (forbidden):
 * the user is authenticated and a valid member, but the org's subscription
 * has lapsed. The main.tsx QueryClient error handler logs them out and
 * redirects here via the auth store state change.
 */
export default function SubscriptionExpiredPage(): React.ReactElement {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div>
      <h1>Subscription Required</h1>
      <p>
        Your organization's DHP subscription is no longer active. Please contact
        your admin to renew.
      </p>
      <button type="button" onClick={logout}>
        Sign out
      </button>
    </div>
  );
}
