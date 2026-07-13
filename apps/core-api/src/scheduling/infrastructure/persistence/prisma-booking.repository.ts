import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ok, err } from '../../../shared-kernel/domain/result.js';
import { SlotConflictError, NotFoundError } from '../../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../../shared-kernel/domain/result.js';
import type { BookingRepositoryPort, ListBookingsFilter } from '../../domain/ports/outbound/booking-repository.port.js';
import type { Booking } from '../../domain/model/booking.js';
import type { TimeRange } from '../../domain/model/time-range.js';
import { TimeRange as TR } from '../../domain/model/time-range.js';
import { PrismaService } from '../../../shared-kernel/infrastructure/persistence/prisma.service.js';

@Injectable()
export class PrismaBookingRepository implements BookingRepositoryPort {
  private readonly logger = new Logger(PrismaBookingRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, organizationId: string): Promise<Booking | null> {
    const row = await this.prisma.booking.findFirst({
      where: { id, organizationId },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByIdempotencyKey(key: string, organizationId: string): Promise<Booking | null> {
    const row = await this.prisma.booking.findFirst({
      where: { idempotencyKey: key, organizationId },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByHost(
    hostId: string,
    organizationId: string,
    statuses?: string[],
  ): Promise<Booking[]> {
    const where: Prisma.BookingWhereInput = { hostId, organizationId };
    if (statuses && statuses.length > 0) {
      where.status = { in: statuses as import('@prisma/client').BookingStatus[] };
    }
    const rows = await this.prisma.booking.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      take: 500,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async listByOrg(filter: ListBookingsFilter): Promise<Booking[]> {
    const where: Prisma.BookingWhereInput = { organizationId: filter.organizationId };
    if (filter.hostId) where.hostId = filter.hostId;
    if (filter.status) where.status = filter.status;
    if (filter.from || filter.to) {
      where.startsAt = {
        ...(filter.from ? { gte: filter.from } : {}),
        ...(filter.to ? { lte: filter.to } : {}),
      };
    }
    const rows = await this.prisma.booking.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      take: 100,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async save(booking: Booking): Promise<Result<Booking, DomainError>> {
    try {
      const row = await this.prisma.booking.create({
        data: {
          id: booking.id,
          organizationId: booking.organizationId,
          hostId: booking.hostId,
          meetingTypeId: booking.meetingTypeId,
          guestEmail: booking.guestEmail,
          guestName: booking.guestName,
          startsAt: booking.timeRange.startsAt,
          endsAt: booking.timeRange.endsAt,
          status: booking.status,
          joinUrl: booking.joinUrl,
          idempotencyKey: booking.idempotencyKey,
        },
      });
      return ok(this.toDomain(row));
    } catch (e) {
      if (this.isExclusionViolation(e)) {
        return err(new SlotConflictError());
      }
      throw e;
    }
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: Booking['status'],
  ): Promise<Result<Booking, DomainError>> {
    try {
      const row = await this.prisma.booking.update({
        where: { id, organizationId },
        data: { status, updatedAt: new Date() },
      });
      return ok(this.toDomain(row));
    } catch (e) {
      if (this.isNotFound(e)) return err(new NotFoundError('Booking', id));
      throw e;
    }
  }

  async reschedule(
    id: string,
    organizationId: string,
    newRange: TimeRange,
  ): Promise<Result<Booking, DomainError>> {
    // Atomic reschedule in serializable transaction (§7 rule 8)
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const current = await tx.booking.findFirst({ where: { id, organizationId } });
        if (!current) throw new NotFoundError('Booking', id);

        // Nullify startsAt/endsAt temporarily then update — the EXCLUDE constraint
        // on (host_id, tstzrange) fires on the new insert within the transaction.
        return tx.booking.update({
          where: { id },
          data: {
            startsAt: newRange.startsAt,
            endsAt: newRange.endsAt,
            status: 'CONFIRMED',
            updatedAt: new Date(),
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return ok(this.toDomain(row));
    } catch (e) {
      if (e instanceof NotFoundError) return err(e);
      if (this.isExclusionViolation(e)) return err(new SlotConflictError());
      throw e;
    }
  }

  private toDomain(row: {
    id: string;
    organizationId: string;
    hostId: string;
    meetingTypeId: string;
    guestEmail: string;
    guestName: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    joinUrl: string | null;
    idempotencyKey: string;
    createdAt: Date;
    updatedAt: Date;
  }): Booking {
    return {
      id: row.id,
      organizationId: row.organizationId,
      hostId: row.hostId,
      meetingTypeId: row.meetingTypeId,
      guestEmail: row.guestEmail,
      guestName: row.guestName,
      timeRange: TR.create(row.startsAt, row.endsAt),
      status: row.status as Booking['status'],
      joinUrl: row.joinUrl,
      answersJson: {},
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private isExclusionViolation(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2010' &&
      typeof e.message === 'string' &&
      e.message.includes('exclusion constraint')
    );
  }

  private isNotFound(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025'
    );
  }
}
