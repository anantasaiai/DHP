import type { Result } from '../../../../shared-kernel/domain/result.js';
import type { DomainError } from '../../../../shared-kernel/domain/result.js';
import type { MeetingType, ConferencingType } from '../../model/meeting-type.js';

export type MeetingTypePatch = Partial<{
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

export interface MeetingTypeRepositoryPort {
  findById(id: string, organizationId: string): Promise<MeetingType | null>;
  findByOwner(ownerUserId: string, organizationId: string): Promise<MeetingType[]>;
  slugExists(slug: string, ownerUserId: string, organizationId: string): Promise<boolean>;
  save(mt: MeetingType): Promise<Result<MeetingType, DomainError>>;
  update(id: string, organizationId: string, patch: MeetingTypePatch): Promise<Result<MeetingType, DomainError>>;
  archive(id: string, organizationId: string): Promise<Result<void, DomainError>>;
}

export const MEETING_TYPE_REPOSITORY_PORT = Symbol('MeetingTypeRepositoryPort');
