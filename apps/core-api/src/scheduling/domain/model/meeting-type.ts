import { ok, err, ValidationError } from '../../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../../shared-kernel/domain/result.js';
import { SlugPolicy } from '../../../shared-kernel/domain/slug-policy.js';

export type ConferencingType = 'google_meet' | 'zoom' | 'teams' | 'webex' | 'custom';

export interface MeetingType {
  readonly id: string;
  readonly organizationId: string;
  readonly ownerUserId: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly durationMinutes: number;
  readonly conferencingType: ConferencingType;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly minNoticeMinutes: number;
  readonly maxDaysInFuture: number;
  readonly maxPerDay: number | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateMeetingTypeProps {
  readonly id: string;
  readonly organizationId: string;
  readonly ownerUserId: string;
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null;
  readonly durationMinutes: number;
  readonly conferencingType: ConferencingType;
  readonly bufferBeforeMinutes?: number;
  readonly bufferAfterMinutes?: number;
  readonly minNoticeMinutes?: number;
  readonly maxDaysInFuture?: number;
  readonly maxPerDay?: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const MeetingTypeFactory = {
  create(props: CreateMeetingTypeProps): Result<MeetingType, DomainError> {
    if (!SlugPolicy.isValid(props.slug)) {
      return err(new ValidationError(SlugPolicy.errorMessage));
    }
    if (props.durationMinutes <= 0) {
      return err(new ValidationError('durationMinutes must be greater than 0'));
    }
    if ((props.bufferBeforeMinutes ?? 0) < 0 || (props.bufferAfterMinutes ?? 0) < 0) {
      return err(new ValidationError('Buffer minutes must be non-negative'));
    }
    if ((props.minNoticeMinutes ?? 0) < 0) {
      return err(new ValidationError('minNoticeMinutes must be non-negative'));
    }
    if ((props.maxDaysInFuture ?? 60) <= 0) {
      return err(new ValidationError('maxDaysInFuture must be greater than 0'));
    }
    return ok({
      id: props.id,
      organizationId: props.organizationId,
      ownerUserId: props.ownerUserId,
      slug: props.slug,
      name: props.name,
      description: props.description ?? null,
      durationMinutes: props.durationMinutes,
      conferencingType: props.conferencingType,
      bufferBeforeMinutes: props.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: props.bufferAfterMinutes ?? 0,
      minNoticeMinutes: props.minNoticeMinutes ?? 0,
      maxDaysInFuture: props.maxDaysInFuture ?? 60,
      maxPerDay: props.maxPerDay ?? null,
      isActive: true,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  },
};
