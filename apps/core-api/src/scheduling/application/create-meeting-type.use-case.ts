import { Inject, Injectable } from '@nestjs/common';
import { err } from '../../shared-kernel/domain/result.js';
import { ValidationError } from '../../shared-kernel/domain/result.js';
import type { Result, DomainError } from '../../shared-kernel/domain/result.js';
import type { CreateMeetingTypeCommand, CreateMeetingTypeUseCasePort } from '../domain/ports/inbound/meeting-type-use-cases.js';
import type { MeetingTypeRepositoryPort } from '../domain/ports/outbound/meeting-type-repository.port.js';
import { MEETING_TYPE_REPOSITORY_PORT } from '../domain/ports/outbound/meeting-type-repository.port.js';
import type { MeetingType } from '../domain/model/meeting-type.js';
import { MeetingTypeFactory } from '../domain/model/meeting-type.js';
import type { ClockPort } from '../../shared-kernel/domain/clock.port.js';
import { CLOCK_PORT } from '../../shared-kernel/domain/clock.port.js';
import type { IdGeneratorPort } from '../../shared-kernel/domain/id-generator.port.js';
import { ID_GENERATOR_PORT } from '../../shared-kernel/domain/id-generator.port.js';

@Injectable()
export class CreateMeetingTypeUseCase implements CreateMeetingTypeUseCasePort {
  constructor(
    @Inject(MEETING_TYPE_REPOSITORY_PORT)
    private readonly repo: MeetingTypeRepositoryPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly idGen: IdGeneratorPort,
  ) {}

  async execute(cmd: CreateMeetingTypeCommand): Promise<Result<MeetingType, DomainError>> {
    const taken = await this.repo.slugExists(cmd.slug, cmd.ownerUserId, cmd.organizationId);
    if (taken) {
      return err(new ValidationError('Slug already exists'));
    }

    const now = this.clock.nowUtc();
    const mtResult = MeetingTypeFactory.create({
      id: this.idGen.generate(),
      organizationId: cmd.organizationId,
      ownerUserId: cmd.ownerUserId,
      slug: cmd.slug,
      name: cmd.name,
      description: cmd.description,
      durationMinutes: cmd.durationMinutes,
      conferencingType: cmd.conferencingType,
      bufferBeforeMinutes: cmd.bufferBeforeMinutes,
      bufferAfterMinutes: cmd.bufferAfterMinutes,
      minNoticeMinutes: cmd.minNoticeMinutes,
      maxDaysInFuture: cmd.maxDaysInFuture,
      maxPerDay: cmd.maxPerDay,
      createdAt: now,
      updatedAt: now,
    });
    if (!mtResult.ok) return mtResult;

    return this.repo.save(mtResult.value);
  }
}
