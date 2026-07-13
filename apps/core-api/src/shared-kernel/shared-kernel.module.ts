import { Global, Module } from '@nestjs/common';
import { SystemClockAdapter } from './infrastructure/clock/system-clock.adapter.js';
import { UuidIdGeneratorAdapter } from './infrastructure/id-generator/uuid-id-generator.adapter.js';
import { CLOCK_PORT } from './domain/clock.port.js';
import { ID_GENERATOR_PORT } from './domain/id-generator.port.js';

@Global()
@Module({
  providers: [
    { provide: CLOCK_PORT, useClass: SystemClockAdapter },
    { provide: ID_GENERATOR_PORT, useClass: UuidIdGeneratorAdapter },
  ],
  exports: [CLOCK_PORT, ID_GENERATOR_PORT],
})
export class SharedKernelModule {}
