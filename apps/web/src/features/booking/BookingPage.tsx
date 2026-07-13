import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client.js';
import { queryKeys } from '../../lib/query-keys/index.js';
import type { BookingResponseDto } from '@dhp/types';

export default function BookingPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const { data: booking } = useQuery({
    queryKey: queryKeys.bookings.detail(id ?? ''),
    queryFn: () => api.get<BookingResponseDto>(`/bookings/${id}`),
    enabled: Boolean(id),
  });

  if (!booking) return <div>Loading…</div>;

  return (
    <div>
      <h1>Booking with {booking.guestName}</h1>
      <p>Status: {booking.status}</p>
      <p>Time: {booking.timeRange.startsAt}</p>
      {booking.joinUrl && <a href={booking.joinUrl}>Join Meeting</a>}
    </div>
  );
}
