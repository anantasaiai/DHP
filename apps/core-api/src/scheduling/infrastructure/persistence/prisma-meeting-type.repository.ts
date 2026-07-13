import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ok, err } from '../../../shared-kernel/domain/result.js';
import { ValidationError, NotFoundError } from '../../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../../shared-kernel/domain/result.js';
import type { MeetingTypeRepositoryPort, MeetingTypePatch } from '../../domain/ports/outbound/meeting-type-repository.port.js';
import type { MeetingType, ConferencingType } from '../../domain/model/meeting-type.js';
import { PrismaService } from '../../../shared-kernel/infrastructure/persistence/prisma.service.js';

@Injectable()
export class PrismaMeetingTypeRepository implements MeetingTypeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, organizationId: string): Promise<MeetingType | null> {
    const row = await this.prisma.meetingType.findFirst({
      where: { id, organizationId },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByOwner(ownerUserId: string, organizationId: string): Promise<MeetingType[]> {
    const rows = await this.prisma.meetingType.findMany({
      where: { ownerUserId, organizationId, isActive: true },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async slugExists(slug: string, ownerUserId: string, organizationId: string): Promise<boolean> {
    const row = await this.prisma.meetingType.findFirst({
      where: { slug, ownerUserId, organizationId },
    });
    return row !== null;
  }

  async save(mt: MeetingType): Promise<Result<MeetingType, DomainError>> {
    try {
      const row = await this.prisma.meetingType.create({
        data: {
          id: mt.id,
          organizationId: mt.organizationId,
          ownerUserId: mt.ownerUserId,
          slug: mt.slug,
          name: mt.name,
          description: mt.description,
          durationMinutes: mt.durationMinutes,
          conferencingType: mt.conferencingType,
          bufferBeforeMinutes: mt.bufferBeforeMinutes,
          bufferAfterMinutes: mt.bufferAfterMinutes,
          minNoticeMinutes: mt.minNoticeMinutes,
          maxDaysInFuture: mt.maxDaysInFuture,
          maxPerDay: mt.maxPerDay,
          isActive: mt.isActive,
          createdAt: mt.createdAt,
          updatedAt: mt.updatedAt,
        },
      });
      return ok(this.toDomain(row));
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        return err(new ValidationError('Slug already exists'));
      }
      throw e;
    }
  }

  async update(
    id: string,
    organizationId: string,
    patch: MeetingTypePatch,
  ): Promise<Result<MeetingType, DomainError>> {
    try {
      const row = await this.prisma.meetingType.update({
        where: { id, organizationId },
        data: { ...patch, updatedAt: new Date() },
      });
      return ok(this.toDomain(row));
    } catch (e) {
      if (this.isNotFound(e)) return err(new NotFoundError('MeetingType', id));
      throw e;
    }
  }

  async archive(id: string, organizationId: string): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.meetingType.update({
        where: { id, organizationId },
        data: { isActive: false, updatedAt: new Date() },
      });
      return ok(undefined);
    } catch (e) {
      if (this.isNotFound(e)) return err(new NotFoundError('MeetingType', id));
      throw e;
    }
  }

  private toDomain(row: {
    id: string;
    organizationId: string;
    ownerUserId: string;
    slug: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    conferencingType: string;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeMinutes: number;
    maxDaysInFuture: number;
    maxPerDay: number | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): MeetingType {
    return {
      id: row.id,
      organizationId: row.organizationId,
      ownerUserId: row.ownerUserId,
      slug: row.slug,
      name: row.name,
      description: row.description,
      durationMinutes: row.durationMinutes,
      conferencingType: row.conferencingType as ConferencingType,
      bufferBeforeMinutes: row.bufferBeforeMinutes,
      bufferAfterMinutes: row.bufferAfterMinutes,
      minNoticeMinutes: row.minNoticeMinutes,
      maxDaysInFuture: row.maxDaysInFuture,
      maxPerDay: row.maxPerDay,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private isUniqueViolation(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
    );
  }

  private isNotFound(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025'
    );
  }
}
