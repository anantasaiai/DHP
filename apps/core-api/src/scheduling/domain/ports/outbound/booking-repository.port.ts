import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { Booking } from '../../model/booking.js';
import type { TimeRange } from '../../model/time-range.js';

export interface ListBookingsFilter {
  readonly organizationId: string;
  readonly hostId?: string;
  readonly status?: Booking['status'];
  readonly from?: Date;
  readonly to?: Date;
}

export interface BookingRepositoryPort {
  findById(id: string, organizationId: string): Promise<Booking | null>;
  findByIdempotencyKey(key: string, organizationId: string): Promise<Booking | null>;
  findByHost(hostId: string, organizationId: string, statuses?: string[]): Promise<Booking[]>;
  listByOrg(filter: ListBookingsFilter): Promise<Booking[]>;
  save(booking: Booking): Promise<Result<Booking, DomainError>>;
  updateStatus(id: string, organizationId: string, status: Booking['status']): Promise<Result<Booking, DomainError>>;
  reschedule(id: string, organizationId: string, newRange: TimeRange): Promise<Result<Booking, DomainError>>;
}

export const BOOKING_REPOSITORY_PORT = Symbol('BookingRepositoryPort');
