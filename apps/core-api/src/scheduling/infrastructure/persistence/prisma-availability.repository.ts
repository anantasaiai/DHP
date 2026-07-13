import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ok, err, NotFoundError } from '../../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../../shared-kernel/domain/result.js';
import type { AvailabilityRepositoryPort, AvailabilityScheduleDto, AvailabilityOverrideDto, CreateScheduleInput, CreateOverrideInput } from '../../domain/ports/outbound/availability-repository.port.js';
import { PrismaService } from '../../../shared-kernel/infrastructure/persistence/prisma.service.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class PrismaAvailabilityRepository implements AvailabilityRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listSchedules(organizationId: string, ownerUserId: string): Promise<AvailabilityScheduleDto[]> {
    const rows = await this.prisma.availabilitySchedule.findMany({
      where: { organizationId, ownerUserId },
      include: { rules: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.scheduleDto(r));
  }

  async findSchedule(id: string, organizationId: string): Promise<AvailabilityScheduleDto | null> {
    const row = await this.prisma.availabilitySchedule.findFirst({ where: { id, organizationId }, include: { rules: true } });
    return row ? this.scheduleDto(row) : null;
  }

  async createSchedule(input: CreateScheduleInput): Promise<Result<AvailabilityScheduleDto, DomainError>> {
    const row = await this.prisma.availabilitySchedule.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        ownerUserId: input.ownerUserId,
        name: input.name,
        timezone: input.timezone,
        isDefault: input.isDefault,
        rules: {
          create: input.rules.map((r) => ({ id: randomUUID(), dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime })),
        },
      },
      include: { rules: true },
    });
    return ok(this.scheduleDto(row));
  }

  async updateSchedule(id: string, organizationId: string, patch: Partial<Pick<CreateScheduleInput, 'name' | 'timezone' | 'isDefault' | 'rules'>>): Promise<Result<AvailabilityScheduleDto, DomainError>> {
    try {
      const data: Prisma.AvailabilityScheduleUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.timezone !== undefined) data.timezone = patch.timezone;
      if (patch.isDefault !== undefined) data.isDefault = patch.isDefault;
      if (patch.rules !== undefined) {
        data.rules = {
          deleteMany: {},
          create: patch.rules.map((r) => ({ id: randomUUID(), dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime })),
        };
      }
      const row = await this.prisma.availabilitySchedule.update({ where: { id, organizationId }, data, include: { rules: true } });
      return ok(this.scheduleDto(row));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return err(new NotFoundError('Schedule', id));
      throw e;
    }
  }

  async deleteSchedule(id: string, organizationId: string): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.availabilitySchedule.delete({ where: { id, organizationId } });
      return ok(undefined);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return err(new NotFoundError('Schedule', id));
      throw e;
    }
  }

  async listRules(scheduleId: string, organizationId: string): Promise<AvailabilityScheduleDto['rules'] | null> {
    const schedule = await this.prisma.availabilitySchedule.findFirst({ where: { id: scheduleId, organizationId }, include: { rules: true } });
    return schedule ? schedule.rules : null;
  }

  async addRule(scheduleId: string, organizationId: string, rule: { dayOfWeek: number; startTime: string; endTime: string }): Promise<Result<{ id: string; dayOfWeek: number; startTime: string; endTime: string }, DomainError>> {
    const schedule = await this.prisma.availabilitySchedule.findFirst({ where: { id: scheduleId, organizationId } });
    if (!schedule) return err(new NotFoundError('Schedule', scheduleId));
    const row = await this.prisma.availabilityRule.create({
      data: { id: randomUUID(), scheduleId, dayOfWeek: rule.dayOfWeek, startTime: rule.startTime, endTime: rule.endTime },
    });
    return ok({ id: row.id, dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime });
  }

  async removeRule(scheduleId: string, organizationId: string, ruleId: string): Promise<Result<void, DomainError>> {
    const schedule = await this.prisma.availabilitySchedule.findFirst({ where: { id: scheduleId, organizationId } });
    if (!schedule) return err(new NotFoundError('Schedule', scheduleId));
    try {
      await this.prisma.availabilityRule.delete({ where: { id: ruleId } });
      return ok(undefined);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return err(new NotFoundError('Rule', ruleId));
      throw e;
    }
  }

  async listOverrides(organizationId: string, ownerUserId: string): Promise<AvailabilityOverrideDto[]> {
    const rows = await this.prisma.availabilityOverride.findMany({ where: { organizationId, ownerUserId }, orderBy: { date: 'asc' } });
    return rows.map((r) => this.overrideDto(r));
  }

  async createOverride(input: CreateOverrideInput): Promise<Result<AvailabilityOverrideDto, DomainError>> {
    try {
      const row = await this.prisma.availabilityOverride.create({
        data: {
          id: randomUUID(),
          organizationId: input.organizationId,
          ownerUserId: input.ownerUserId,
          date: input.date,
          available: input.available,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          reason: input.reason ?? null,
        },
      });
      return ok(this.overrideDto(row));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return err({ code: 'VALIDATION_ERROR', message: 'An override for this date already exists' } as DomainError);
      }
      throw e;
    }
  }

  async deleteOverride(id: string, organizationId: string): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.availabilityOverride.delete({ where: { id, organizationId } });
      return ok(undefined);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return err(new NotFoundError('Override', id));
      throw e;
    }
  }

  private scheduleDto(r: { id: string; organizationId: string; ownerUserId: string; name: string; timezone: string; isDefault: boolean; createdAt: Date; updatedAt: Date; rules: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }> }): AvailabilityScheduleDto {
    return { id: r.id, organizationId: r.organizationId, ownerUserId: r.ownerUserId, name: r.name, timezone: r.timezone, isDefault: r.isDefault, rules: r.rules, createdAt: r.createdAt, updatedAt: r.updatedAt };
  }

  private overrideDto(r: { id: string; organizationId: string; ownerUserId: string; date: Date; available: boolean; startTime: string | null; endTime: string | null; reason: string | null; createdAt: Date }): AvailabilityOverrideDto {
    return { id: r.id, organizationId: r.organizationId, ownerUserId: r.ownerUserId, date: r.date, available: r.available, startTime: r.startTime, endTime: r.endTime, reason: r.reason, createdAt: r.createdAt };
  }
}
