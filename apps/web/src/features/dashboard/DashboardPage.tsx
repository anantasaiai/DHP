import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client.js';
import { queryKeys } from '../../lib/query-keys/index.js';
import { useRealtimeChannel } from '../../lib/realtime/useRealtimeChannel.js';
import { useAuthStore } from '../../store/auth.store.js';
import type { BookingResponseDto } from '@dhp/types';

/**
 * Host dashboard — §4.3.
 *
 * Real-time wiring (§2.2):
 * The dashboard SSE channel (dashboard:{org_id}:{user_id}) pushes booking
 * lifecycle events. On every event — and on every reconnect — the bookings
 * query is invalidated and re-fetched, keeping the dashboard current without
 * polling. The SSE event is only a trigger; the REST read is the source of truth.
 */
export default function DashboardPage(): React.ReactElement {
  const principal = useAuthStore((s) => s.principal);

  // §2.2 — authenticated dashboard SSE channel.
  // The server resolves org_id and user_id from the Bearer token, so the URL
  // carries no client-supplied identity claim.
  // Admins additionally receive the org-rollup channel server-side.
  useRealtimeChannel(
    principal ? '/api/v1/realtime/dashboard' : null,
    [queryKeys.bookings.all, queryKeys.dashboard.metrics],
  );

  const { data: bookings, isLoading } = useQuery({
    queryKey: queryKeys.bookings.all,
    queryFn: () => api.get<BookingResponseDto[]>('/bookings'),
  });

  return (
    <div>
      <h1>Dashboard</h1>
      <h2>Upcoming Bookings</h2>

      {isLoading && <p>Loading…</p>}

      {bookings?.map((b) => (
        <div key={b.id}>
          <strong>{b.guestName}</strong> — {b.timeRange.startsAt} — {b.status}
          {b.joinUrl && (
            <a href={b.joinUrl} target="_blank" rel="noopener noreferrer">
              Join
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
