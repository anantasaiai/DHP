import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api/client.js';
import { queryKeys } from '../../lib/query-keys/index.js';
import { useRealtimeChannel } from '../../lib/realtime/useRealtimeChannel.js';
import type { SlotDto, BookingResponseDto, CreateBookingDto } from '@dhp/types';

/**
 * Public booking page — account-free (§4.6).
 * Route: /:orgSlug/:username/:meetingSlug
 *
 * Real-time wiring (§2.2):
 * The public availability SSE channel (availability:{org_id}:{host_id}) pushes
 * slot-taken events so a guest never selects an already-taken slot from a stale
 * view. On every event — and on every reconnect — the slots query is invalidated
 * and re-fetched. The SSE event is a trigger only; the REST read is the truth.
 *
 * Auth: none required. The org is resolved from the URL namespace (orgSlug),
 * never from a guest-supplied trust claim (§7A.2). Rate limited per-IP and
 * per-(org, meeting_type) (§11A.2).
 */
export default function PublicBookingPage(): React.ReactElement {
  const { orgSlug, username, meetingSlug } = useParams<{
    orgSlug: string;
    username: string;
    meetingSlug: string;
  }>();

  const [selectedSlot, setSelectedSlot] = useState<SlotDto | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [confirmed, setConfirmed] = useState<BookingResponseDto | null>(null);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date().toISOString().slice(0, 10);
  const dateTo = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const slotsKey = queryKeys.slots.available(
    orgSlug ?? '',
    username ?? '',
    meetingSlug ?? '',
    today,
    dateTo,
    timezone,
  );

  // §2.2 — public availability SSE channel.
  // URL scoped to exactly one (org_slug, username, meeting_slug) — no credential
  // required; the server uses URL params, not a token, to resolve the channel.
  useRealtimeChannel(
    orgSlug && username && meetingSlug
      ? `/api/v1/realtime/public/${orgSlug}/${username}/${meetingSlug}`
      : null,
    [slotsKey],
  );

  const { data: slots, isLoading } = useQuery({
    queryKey: slotsKey,
    queryFn: () =>
      api.get<SlotDto[]>(
        `/public/${orgSlug}/${username}/${meetingSlug}/slots?timezone=${timezone}&dateFrom=${today}&dateTo=${dateTo}`,
      ),
    enabled: Boolean(orgSlug && username && meetingSlug),
  });

  const bookingMutation = useMutation({
    mutationFn: (dto: CreateBookingDto) =>
      api.post<BookingResponseDto>(
        `/public/${orgSlug}/${username}/${meetingSlug}/book`,
        dto,
        dto.idempotencyKey,
      ),
    onSuccess: (booking) => {
      setConfirmed(booking);
    },
  });

  if (confirmed) {
    return (
      <div>
        <h1>Booking Confirmed!</h1>
        <p>You'll receive a confirmation at {confirmed.guestEmail}.</p>
        {confirmed.joinUrl && (
          <a href={confirmed.joinUrl} target="_blank" rel="noopener noreferrer">
            Join Meeting
          </a>
        )}
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!selectedSlot) return;
    const idempotencyKey = `${guestEmail}:${selectedSlot.startsAt}:${meetingSlug}`;
    bookingMutation.mutate({
      meetingTypeId: meetingSlug ?? '',
      hostId: username ?? '',
      guestEmail,
      guestName,
      startsAt: selectedSlot.startsAt,
      idempotencyKey,
    });
  };

  return (
    <div>
      <h1>
        Book with {username} — {meetingSlug}
      </h1>

      {isLoading && <p>Loading available slots…</p>}

      {slots && !selectedSlot && (
        <ul>
          {slots.map((slot) => (
            <li key={slot.startsAt}>
              <button type="button" onClick={() => setSelectedSlot(slot)}>
                {new Date(slot.startsAt).toLocaleString(undefined, { timeZone: timezone })}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedSlot && (
        <form onSubmit={handleSubmit}>
          <p>
            Selected:{' '}
            {new Date(selectedSlot.startsAt).toLocaleString(undefined, { timeZone: timezone })}
          </p>
          <button
            type="button"
            onClick={() => setSelectedSlot(null)}
            aria-label="Change slot"
          >
            ← Change
          </button>
          <label>
            Name
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={bookingMutation.isPending}>
            {bookingMutation.isPending ? 'Booking…' : 'Confirm Booking'}
          </button>
          {bookingMutation.isError && (
            <p role="alert">
              {bookingMutation.error instanceof Error
                ? bookingMutation.error.message
                : 'Booking failed. Please try again.'}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
