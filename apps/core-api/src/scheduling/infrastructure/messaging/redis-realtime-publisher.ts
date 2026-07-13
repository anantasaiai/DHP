import { Injectable, Inject } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { RealtimePublisherPort, RealtimePayload } from '../../domain/ports/outbound/realtime-publisher.port.js';
import { REALTIME_PUBLISHER_PORT } from '../../domain/ports/outbound/realtime-publisher.port.js';

@Injectable()
export class RedisRealtimePublisher implements RealtimePublisherPort {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async publish(channel: string, event: RealtimePayload): Promise<void> {
    await this.redis.publish(channel, JSON.stringify(event));
  }
}

export { REALTIME_PUBLISHER_PORT };
