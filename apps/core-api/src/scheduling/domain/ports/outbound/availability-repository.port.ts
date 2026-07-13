import type { Result, DomainError } from '../../../../shared-kernel/domain/result.js';

export interface AvailabilityScheduleDto {
  id: string;
  organizationId: string;
  ownerUserId: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  rules: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailabilityOverrideDto {
  id: string;
  organizationId: string;
  ownerUserId: string;
  date: Date;
  available: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface CreateScheduleInput {
  ownerUserId: string;
  organizationId: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
}

export interface CreateOverrideInput {
  ownerUserId: string;
  organizationId: string;
  date: Date;
  available: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}

export interface AvailabilityRepositoryPort {
  listSchedules(organizationId: string, ownerUserId: string): Promise<AvailabilityScheduleDto[]>;
  findSchedule(id: string, organizationId: string): Promise<AvailabilityScheduleDto | null>;
  createSchedule(input: CreateScheduleInput): Promise<Result<AvailabilityScheduleDto, DomainError>>;
  updateSchedule(id: string, organizationId: string, patch: Partial<Pick<CreateScheduleInput, 'name' | 'timezone' | 'isDefault' | 'rules'>>): Promise<Result<AvailabilityScheduleDto, DomainError>>;
  deleteSchedule(id: string, organizationId: string): Promise<Result<void, DomainError>>;
  listRules(scheduleId: string, organizationId: string): Promise<AvailabilityScheduleDto['rules'] | null>;
  addRule(scheduleId: string, organizationId: string, rule: { dayOfWeek: number; startTime: string; endTime: string }): Promise<Result<{ id: string; dayOfWeek: number; startTime: string; endTime: string }, DomainError>>;
  removeRule(scheduleId: string, organizationId: string, ruleId: string): Promise<Result<void, DomainError>>;
  listOverrides(organizationId: string, ownerUserId: string): Promise<AvailabilityOverrideDto[]>;
  createOverride(input: CreateOverrideInput): Promise<Result<AvailabilityOverrideDto, DomainError>>;
  deleteOverride(id: string, organizationId: string): Promise<Result<void, DomainError>>;
}

export const AVAILABILITY_REPOSITORY_PORT = Symbol('AvailabilityRepositoryPort');
