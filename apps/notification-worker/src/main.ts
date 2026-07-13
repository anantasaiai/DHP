/**
 * Notification worker entry point — §4 module 8, §9.1, §11A.5.
 *
 * Responsibilities:
 *  - Drain the transactional outbox (poll PENDING/FAILED rows every 5 s)
 *  - Dispatch email notifications via EmailDispatcherPort adapters
 *    (SES / SendGrid / Mailgun with SMTP fallback, §4 module 9)
 *  - At-least-once delivery with bounded retries + dead-letter (§11A.5)
 *  - Reminder coherence: a reminder must never fire for a cancelled or moved
 *    meeting (§7 reminder-coherence note)
 *  - Audit every dispatch to notification_audit (§4 module 8)
 *
 * Separate deploy from core-api: different scaling profile (burst on booking
 * events vs. steady request traffic), and isolating failure here does not
 * affect booking correctness (DHP is the system of record — §9.1).
 */

import { Redis } from 'ioredis';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { drainOnce } from './outbox-drain.js';
import { logger } from './logger.js';

// ─── Configuration ────────────────────────────────────────────────────────────

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const DATABASE_URL = process.env['DATABASE_URL'];
const QUEUE_NAME = 'notification';
const DRAIN_INTERVAL_MS = 5_000;

if (!DATABASE_URL) {
  logger.fatal('DATABASE_URL env var is required');
  process.exit(1);
}

// ─── Prisma (outbox drain) ────────────────────────────────────────────────────

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
  log: [{ level: 'warn', emit: 'stdout' }, { level: 'error', emit: 'stdout' }],
});

// ─── Redis ────────────────────────────────────────────────────────────────────

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// ─── BullMQ Worker — explicit push-style jobs from Core API ──────────────────
//
// Core pushes jobs for:
//   • type='send-email'    — ad-hoc transactional email (non-outbox path)
//   • type='send-reminder' — reminder coherence-checked delivery (§7)
//
// TODO(slice-9): implement email dispatch adapters (SES / SendGrid / Mailgun).
// TODO(slice-7): check booking status before dispatching reminders.

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const jobLog = logger.child({ jobId: job.id, jobType: job.name });
    jobLog.info('processing job');

    switch (job.name) {
      case 'send-email': {
        // TODO(slice-9): call EmailDispatcherPort.send(job.data as EmailPayload)
        jobLog.info({ data: job.data }, 'send-email — pending email adapter implementation');
        break;
      }
      case 'send-reminder': {
        // TODO(slice-7): verify booking not CANCELLED/RESCHEDULED, then send
        jobLog.info({ data: job.data }, 'send-reminder — pending reminder coherence check');
        break;
      }
      default: {
        jobLog.warn('unknown job type — skipping');
      }
    }
  },
  {
    connection: { url: REDIS_URL },
    concurrency: parseInt(process.env['WORKER_CONCURRENCY'] ?? '5', 10),
  },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'job failed');
});

// ─── Outbox Drain Loop ────────────────────────────────────────────────────────

let drainRunning = false;

const drainTimer = setInterval(async () => {
  if (drainRunning) return;
  drainRunning = true;
  try {
    await drainOnce(prisma, logger);
  } catch (err) {
    logger.error({ err }, 'unhandled error in drain loop');
  } finally {
    drainRunning = false;
  }
}, DRAIN_INTERVAL_MS);

// ─── Startup ──────────────────────────────────────────────────────────────────

logger.info({ queue: QUEUE_NAME, drainIntervalMs: DRAIN_INTERVAL_MS }, 'notification-worker started');

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  clearInterval(drainTimer);
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  logger.info('shutdown complete');
  process.exit(0);
});
