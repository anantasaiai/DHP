import { Inject, Injectable } from '@nestjs/common';
import { err } from '../../shared-kernel/domain/result.js';
import { NotFoundError, ForbiddenError } from '../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../shared-kernel/domain/result.js';
import type { UpdateMeetingTypeCommand, UpdateMeetingTypeUseCasePort } from '../domain/ports/inbound/meeting-type-use-cases.js';
import type { MeetingTypeRepositoryPort } from '../domain/ports/outbound/meeting-type-repository.port.js';
import { MEETING_TYPE_REPOSITORY_PORT } from '../domain/ports/outbound/meeting-type-repository.port.js';
import type { MeetingType } from '../domain/model/meeting-type.js';

@Injectable()
export class UpdateMeetingTypeUseCase implements UpdateMeetingTypeUseCasePort {
  constructor(
    @Inject(MEETING_TYPE_REPOSITORY_PORT)
    private readonly repo: MeetingTypeRepositoryPort,
  ) {}

  async execute(cmd: UpdateMeetingTypeCommand): Promise<Result<MeetingType, DomainError>> {
    const existing = await this.repo.findById(cmd.id, cmd.organizationId);
    if (!existing) {
      return err(new NotFoundError('MeetingType', cmd.id));
    }
    if (existing.organizationId !== cmd.organizationId) {
      return err(new ForbiddenError());
    }

    return this.repo.update(cmd.id, cmd.organizationId, cmd.patch);
  }
}
