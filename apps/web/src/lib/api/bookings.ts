import { api } from './client.js';

export interface BookingDto {
  id: string;
  organizationId: string;
  hostId: string;
  meetingTypeId: string;
  guestEmail: string;
  guestName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  joinUrl?: string;
  appointmentType: string;
  createdAt: string;
}

export interface CreateBookingPayload {
  meetingTypeId: string;
  hostId: string;
  guestEmail: string;
  guestName: string;
  startsAt: string;
  endsAt: string;
  appointmentType: 'online' | 'in_person';
  idempotencyKey: string;
}

export const listBookings = () => api.get<BookingDto[]>('/bookings');
export const createBooking = (p: CreateBookingPayload) =>
  api.post<BookingDto>('/bookings', p, p.idempotencyKey);
export const cancelBooking = (id: string) => api.delete(`/bookings/${id}`);
export const rescheduleBooking = (
  id: string,
  payload: { startsAt: string; endsAt: string },
) => api.patch<BookingDto>(`/bookings/${id}/reschedule`, payload);
