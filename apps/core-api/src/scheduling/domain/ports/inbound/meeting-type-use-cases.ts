import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { MeetingType, ConferencingType } from '../../model/meeting-type.js';

export interface CreateMeetingTypeCommand {
  readonly organizationId: string;
  readonly ownerUserId: string;
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly durationMinutes: number;
  readonly conferencingType: ConferencingType;
  readonly bufferBeforeMinutes?: number;
  readonly bufferAfterMinutes?: number;
  readonly minNoticeMinutes?: number;
  readonly maxDaysInFuture?: number;
  readonly maxPerDay?: number;
}

export interface UpdateMeetingTypeCommand {
  readonly id: string;
  readonly organizationId: string;
  readonly patch: Partial<{
    name: string;
    description: string | null;
    durationMinutes: number;
    conferencingType: ConferencingType;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeMinutes: number;
    maxDaysInFuture: number;
    maxPerDay: number | null;
  }>;
}

export interface ArchiveMeetingTypeCommand {
  readonly id: string;
  readonly organizationId: string;
  readonly requestedByUserId: string;
}

export interface CreateMeetingTypeUseCasePort {
  execute(cmd: CreateMeetingTypeCommand): Promise<Result<MeetingType, DomainError>>;
}

export interface UpdateMeetingTypeUseCasePort {
  execute(cmd: UpdateMeetingTypeCommand): Promise<Result<MeetingType, DomainError>>;
}

export interface ArchiveMeetingTypeUseCasePort {
  execute(cmd: ArchiveMeetingTypeCommand): Promise<Result<void, DomainError>>;
}

export const CREATE_MEETING_TYPE_USE_CASE = Symbol('CreateMeetingTypeUseCasePort');
export const UPDATE_MEETING_TYPE_USE_CASE = Symbol('UpdateMeetingTypeUseCasePort');
export const ARCHIVE_MEETING_TYPE_USE_CASE = Symbol('ArchiveMeetingTypeUseCasePort');
