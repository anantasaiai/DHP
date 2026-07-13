import IORedis from 'ioredis';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Provider } from '@nestjs/common';

@Injectable()
export class RedisClient extends IORedis implements OnModuleDestroy {
  constructor() {
    super(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}

export const RedisProvider: Provider = {
  provide: 'REDIS_CLIENT',
  useClass: RedisClient,
};
