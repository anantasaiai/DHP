import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IdGeneratorPort } from '../../domain/id-generator.port.js';

@Injectable()
export class UuidIdGeneratorAdapter implements IdGeneratorPort {
  generate(): string {
    return randomUUID();
  }
}
