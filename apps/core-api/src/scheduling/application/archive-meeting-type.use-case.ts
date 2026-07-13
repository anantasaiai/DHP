import { Inject, Injectable } from '@nestjs/common';
import { err } from '../../shared-kernel/domain/result.js';
import { NotFoundError, ForbiddenError } from '../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../shared-kernel/domain/result.js';
import type { ArchiveMeetingTypeCommand, ArchiveMeetingTypeUseCasePort } from '../domain/ports/inbound/meeting-type-use-cases.js';
import type { MeetingTypeRepositoryPort } from '../domain/ports/outbound/meeting-type-repository.port.js';
import { MEETING_TYPE_REPOSITORY_PORT } from '../domain/ports/outbound/meeting-type-repository.port.js';

@Injectable()
export class ArchiveMeetingTypeUseCase implements ArchiveMeetingTypeUseCasePort {
  constructor(
    @Inject(MEETING_TYPE_REPOSITORY_PORT)
    private readonly repo: MeetingTypeRepositoryPort,
  ) {}

  async execute(cmd: ArchiveMeetingTypeCommand): Promise<Result<void, DomainError>> {
    const existing = await this.repo.findById(cmd.id, cmd.organizationId);
    if (!existing) {
      return err(new NotFoundError('MeetingType', cmd.id));
    }
    if (existing.organizationId !== cmd.organizationId) {
      return err(new ForbiddenError());
    }

    return this.repo.archive(cmd.id, cmd.organizationId);
  }
}
