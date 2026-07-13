export interface ClockPort {
  now(): Date;
  nowUtc(): Date;
}

export const CLOCK_PORT = Symbol('ClockPort');
