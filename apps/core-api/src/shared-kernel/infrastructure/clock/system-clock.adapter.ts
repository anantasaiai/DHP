import { Injectable } from '@nestjs/common';
import type { ClockPort } from '../../domain/clock.port.js';

@Injectable()
export class SystemClockAdapter implements ClockPort {
  now(): Date {
    return new Date();
  }

  nowUtc(): Date {
    return new Date();
  }
}
