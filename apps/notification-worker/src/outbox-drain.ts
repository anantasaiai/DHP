/**
 * Outbox drain — §9.1, §11A.5.
 *
 * Polls the `outbox` table for PENDING/FAILED rows that are due for processing
 * and attempts to dispatch them.  All email dispatch is currently a structured
 * log (real EmailDispatcherPort adapters are a team task for §4 module 9).
 *
 * Retry strategy: exponential back-off, capped at 5 attempts → DEAD.
 *   attempt 1 → +30 s
 *   attempt 2 → +60 s
 *   attempt 3 → +120 s
 *   attempt 4 → +240 s
 *   attempt 5 → DEAD (no further retry)
 */

import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

const BACKOFF_SECONDS = [30, 60, 120, 240, 480];

function nextAttemptAt(attempts: number): Date {
  const delay = BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length - 1)] ?? 480;
  return new Date(Date.now() + delay * 1_000);
}

export interface OutboxRow {
  id: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payloadJson: unknown;
  status: string;
  attempts: number;
  nextAttemptAt: Date | null;
  idempotencyKey: string;
  createdAt: Date;
}

/**
 * Dispatch a single outbox row.
 *
 * TODO(slice-9): replace the log call with real EmailDispatcherPort calls
 *   (SES / SendGrid / Mailgun adapters).  The payload shape is EmailPayload
 *   from email-dispatcher.port.ts; extract it from row.payloadJson.
 */
async function dispatch(row: OutboxRow, log: Logger): Promise<void> {
  log.info(
    { rowId: row.id, eventType: row.eventType, aggregateId: row.aggregateId },
    'dispatching outbox row — pending email adapter implementation',
  );
}

/**
 * Run one drain pass: pick up to BATCH_SIZE due rows, dispatch each,
 * and update status accordingly.
 *
 * Uses FOR UPDATE SKIP LOCKED so concurrent drain instances don't double-process.
 */
export async function drainOnce(prisma: PrismaClient, log: Logger): Promise<void> {
  const rows = await prisma.$queryRaw<OutboxRow[]>`
    SELECT
      id,
      organization_id AS "organizationId",
      aggregate_type   AS "aggregateType",
      aggregate_id     AS "aggregateId",
      event_type       AS "eventType",
      payload_json     AS "payloadJson",
      status,
      attempts,
      next_attempt_at  AS "nextAttemptAt",
      idempotency_key  AS "idempotencyKey",
      created_at       AS "createdAt"
    FROM outbox
    WHERE status IN ('PENDING', 'FAILED')
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
    ORDER BY created_at ASC
    LIMIT ${BATCH_SIZE}
    FOR UPDATE SKIP LOCKED
  `;

  if (rows.length === 0) return;

  log.debug({ count: rows.length }, 'outbox drain batch');

  for (const row of rows) {
    const rowLog = log.child({ rowId: row.id, eventType: row.eventType });
    try {
      await dispatch(row, rowLog);

      await prisma.$executeRaw`
        UPDATE outbox
        SET
          status       = 'DONE',
          processed_at = NOW(),
          attempts     = ${row.attempts + 1}
        WHERE id = ${row.id}
      `;

      rowLog.info('outbox row dispatched');
    } catch (err) {
      const newAttempts = row.attempts + 1;
      const isDead = newAttempts >= MAX_ATTEMPTS;

      rowLog.error({ err, attempts: newAttempts, dead: isDead }, 'outbox dispatch failed');

      if (isDead) {
        await prisma.$executeRaw`
          UPDATE outbox
          SET status = 'DEAD', attempts = ${newAttempts}
          WHERE id = ${row.id}
        `;
      } else {
        const retryAt = nextAttemptAt(newAttempts);
        await prisma.$executeRaw`
          UPDATE outbox
          SET
            status          = 'FAILED',
            attempts        = ${newAttempts},
            next_attempt_at = ${retryAt}
          WHERE id = ${row.id}
        `;
      }
    }
  }
}
