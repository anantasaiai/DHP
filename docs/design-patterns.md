# DHP Design Patterns

This document describes every architectural and implementation pattern used in the DHP codebase. Each entry explains what the pattern is, why it was chosen, where it lives in the code, and a representative example.

---

## 1. Hexagonal Architecture (Ports and Adapters)

### Description

The core API is organised into three concentric layers: domain, application, and infrastructure. The dependency rule is strict: arrows always point inward. Infrastructure depends on application; application depends on domain; domain depends on nothing outside itself.

- **Domain** — pure TypeScript. No framework imports, no I/O, no `@nestjs/*`, no `@prisma/client`. Contains entities, value objects, and port interfaces.
- **Application** — orchestrates the domain via inbound and outbound port interfaces. Use cases live here.
- **Infrastructure** — NestJS controllers, Prisma adapters, Redis adapters, HTTP clients. Implements the outbound ports and calls the inbound ports.

Inbound ports are use-case interfaces called by HTTP controllers. Outbound ports are repository or service interfaces called by use cases and implemented in infrastructure.

### Rationale

The domain can be tested without a running database, HTTP server, or Redis instance. Swapping the ORM, message broker, or email provider requires touching only the infrastructure layer. The domain and application layers are never coupled to deployment concerns.

### Implementation

```
src/<context>/domain/          — entities, port interfaces, domain errors
src/<context>/application/     — use case implementations
src/<context>/infrastructure/  — NestJS modules, Prisma repositories, HTTP controllers
src/shared-kernel/domain/      — cross-context primitives (Result, ClockPort, IdGeneratorPort)
```

Hard rule enforced by review: `domain/` and `application/` directories must not contain any import that resolves to `@nestjs/*`, `@prisma/client`, or any I/O library.

### Example

`src/booking/domain/ports/inbound/book-slot.use-case.ts` declares the inbound port:

```typescript
export interface BookSlotUseCasePort {
  execute(command: BookSlotCommand): Promise<Result<Booking, DomainError>>;
}
export const BOOK_SLOT_USE_CASE = Symbol('BookSlotUseCasePort');
```

`src/booking/domain/ports/outbound/booking-repository.port.ts` declares the outbound port:

```typescript
export interface BookingRepositoryPort {
  findById(id: string, organizationId: string): Promise<Booking | null>;
  save(booking: Booking): Promise<Result<Booking, DomainError>>;
  // ...
}
export const BOOKING_REPOSITORY_PORT = Symbol('BookingRepositoryPort');
```

The NestJS infrastructure module binds the Prisma implementation to `BOOKING_REPOSITORY_PORT`. The use case receives it via constructor injection without knowing Prisma exists.

---

## 2. Backend-for-Frontend (BFF)

### Description

The browser never contacts AuthPlex (the OIDC identity provider) directly. The core API performs the full server-side OIDC flow on behalf of the browser: it generates the PKCE verifier, constructs the authorization URL, exchanges the code for tokens, and returns a session to the browser as a JSON response.

The PKCE verifier is generated and consumed entirely within a single server-side request. It is never stored in a database and never leaves the API process.

### Rationale

Eliminating a client-side OIDC library removes a broad class of token interception attacks: the access token is never in the browser's memory or local storage. The browser only sees a JSON POST/response — no redirects, no OIDC libraries, no tokens.

### Implementation

Location: `src/auth/infrastructure/http/` — the auth controller handles `POST /auth/login` and the token exchange callback internally. The AuthPlex SDK is used only in the infrastructure layer; domain and application layers are unaware of OIDC.

### Example

```
Browser  →  POST /api/auth/login  →  Core API
Core API →  (generates PKCE verifier + code challenge, server-side)
Core API →  GET /authorize?code_challenge=...  →  AuthPlex
AuthPlex →  302 callback with code  →  Core API
Core API →  POST /token (code + verifier)  →  AuthPlex
AuthPlex →  { access_token, id_token }  →  Core API
Core API →  { session_token }  →  Browser
```

---

## 3. Transactional Outbox

### Description

When a booking is created, the booking row and the outbox row are written in the same `BEGIN`/`COMMIT`. Either both commit or neither does. The notification worker polls the outbox table separately and processes events after the transaction completes.

The outbox uses `SELECT FOR UPDATE SKIP LOCKED` to claim rows safely under concurrent workers (see Pattern 16).

### Rationale

Writing to Redis or an external queue inside a database transaction creates a dual-write risk: the external write could succeed while the database rolls back (or vice versa), producing a lost or phantom event. The outbox pattern eliminates this by making event publication a consequence of a committed database write, not a parallel side effect.

### Implementation

Tables: `outbox` in `docs/schema-reference.sql`.  
Worker: `apps/notification-worker/` (BullMQ).  
Outbound port: `src/booking/domain/ports/outbound/event-publisher.port.ts`.  
Infrastructure adapter: `src/booking/infrastructure/messaging/`.

Hard rule: never call Redis, SQS, or any external queue client from inside a database transaction.

### Example

```sql
BEGIN;
  INSERT INTO bookings (...) VALUES (...);
  INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload_json, idempotency_key)
    VALUES ('booking', '<booking_id>', 'booking.created', '{"..."}', '<uuid>');
COMMIT;
```

---

## 4. Result\<T, E\> (Railway-Oriented Programming)

### Description

All domain and application layer functions return a discriminated union `Result<T, E>` instead of throwing exceptions. `Result.ok(value)` represents success; `Result.err(error)` represents a handled failure. The callers are forced by the type system to inspect the `ok` flag before accessing the value.

The infrastructure layer (NestJS controllers) is the only place that converts a `Result` error into an HTTP exception, via `ErrorMapper`.

### Rationale

Exceptions are invisible in function signatures — a caller cannot tell from the type alone that a function might throw `SlotConflictError` versus `NotFoundError`. With `Result<T, E>`, every failure mode is part of the function signature. The compiler enforces handling; errors cannot be silently swallowed.

### Implementation

File: `src/shared-kernel/domain/result.ts`  
Error mapper: `src/shared-kernel/infrastructure/http/error-mapper.ts`

### Example

```typescript
// result.ts
export type Result<T, E = Error> = Ok<T> | Err<E>;
export function ok<T>(value: T): Ok<T> { return { ok: true, value }; }
export function err<E>(error: E): Err<E> { return { ok: false, error }; }

// Use-case return type
execute(command: BookSlotCommand): Promise<Result<Booking, DomainError>>;

// Controller translates to HTTP
const result = await useCase.execute(command);
if (!result.ok) throw mapDomainErrorToHttpException(result.error);
return result.value;
```

Domain error types (`SlotConflictError`, `NotFoundError`, `ValidationError`, `ForbiddenError`, `TokenError`) are defined in `result.ts` alongside the `Result` type. The error mapper in the infrastructure layer converts each type to the corresponding HTTP status code (409, 404, 400, 403, 410).

---

## 5. GiST EXCLUDE Constraint (Optimistic Concurrency for Bookings)

### Description

Double-booking prevention is enforced at the PostgreSQL layer using a GiST exclusion constraint on the `bookings` table. The constraint prevents two rows with the same `host_id` and overlapping `time_range` from existing simultaneously when either has a status of `CONFIRMED` or `PENDING`.

Application-level slot availability checks are advisory UX only. The database constraint is the definitive guard.

### Rationale

Any application-level check-then-insert sequence is subject to a TOCTOU (time-of-check/time-of-use) race condition under concurrent requests. A GiST exclusion constraint is atomic at the storage engine level — two concurrent transactions cannot both commit a conflicting booking. This eliminates the race condition entirely without requiring distributed locks.

### Implementation

Table: `bookings` — `migrations/V1__init_core_schema.sql` and `docs/schema-reference.sql`.  
Extension required: `btree_gist`.  
Error handling: a constraint violation is caught in the Prisma repository adapter and mapped to `SlotConflictError`, which the error mapper converts to HTTP 409.

### Example

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_double_booking
  EXCLUDE USING gist (
    host_id    WITH =,
    time_range WITH &&
  ) WHERE (status IN ('CONFIRMED', 'PENDING'));
```

---

## 6. Row-Level Security (RLS) — Tenant Isolation

### Description

Every tenant-scoped table has `ENABLE ROW LEVEL SECURITY`. At the start of each request-scoped transaction, the application sets a session variable:

```sql
SET LOCAL app.current_organization_id = '<org_uuid>';
```

Every RLS policy reads this variable and filters rows accordingly. A query that omits a `WHERE organization_id = ...` clause returns empty rows rather than cross-tenant data.

### Rationale

RLS is a database-level backstop. Even if application code has a bug that omits a tenant filter, the database enforces isolation. This prevents a class of data leakage bugs that survive code review.

### Implementation

RLS policies are defined in `docs/schema-reference.sql`. Tables without a direct `organization_id` column (e.g. `booking_attendees`, `booking_tokens`, `reminder_jobs`) are scoped through a subquery on their parent table.

Tables intentionally without RLS: `roles`, `permissions`, `role_permissions`, `features` (global platform data), `platform_admins`, `platform_admin_access_log` (read before org context is established).

### Example

```sql
-- Standard policy on a direct organization_id table
CREATE POLICY org_isolation ON bookings
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- Policy on a table scoped through a parent join
CREATE POLICY org_isolation ON booking_attendees
  USING (
    booking_id IN (
      SELECT id FROM bookings
      WHERE organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );
```

---

## 7. Defence in Depth (Three-Gate Authorization)

### Description

Authorization is layered across multiple independent enforcement points. No single point of bypass exists.

| Gate | Mechanism | What it enforces |
|---|---|---|
| Gate 0 | Subscription check | Returns HTTP 402 if org status is `CANCELLED` or `PAST_DUE` |
| Gate 1 | `AuthplexJwtGuard` | Validates JWT signature, `iss`, `aud`; attaches `Principal` to request |
| Gate 2 | `RbacGuard` | Checks `@RequireRoles()` metadata against `principal.role` |
| Gate 3 | PostgreSQL RLS | DB-level tenant isolation regardless of application code |
| Gate 4 | Use-case ownership check | Caller must own the specific resource (e.g. their own booking) |

### Rationale

A single authorization layer creates a single point of failure. Defence in depth means that a misconfigured route guard, a missing decorator, or a buggy use case does not result in data access — the next gate catches it. RLS in particular is unconditional and cannot be bypassed by application logic mistakes.

### Implementation

Guards: `src/auth/infrastructure/http/` and `src/shared-kernel/infrastructure/http/`.  
RLS: `docs/schema-reference.sql`.  
Ownership checks: use-case implementations in `src/booking/application/`.

---

## 8. Idempotency Key Pattern

### Description

Every booking `POST` request must include an `Idempotency-Key` header containing a client-generated UUID. Before inserting a new booking, the use case checks whether a booking with the same key already exists for the organization. If found, it returns the original response without side effects.

The uniqueness of the key is also enforced at the database level. Duplicate event processing in the outbox is prevented by the same mechanism on the `outbox` table.

### Rationale

Networks are unreliable. A client may retry a request after a timeout without knowing whether the first attempt succeeded. Without idempotency, retries produce duplicate bookings. With idempotency keys, retries are safe — they return the same result as the original request.

### Implementation

```sql
-- bookings table
UNIQUE (organization_id, idempotency_key)

-- outbox table
idempotency_key TEXT NOT NULL UNIQUE
```

Application check in `src/booking/application/` uses `BookingRepositoryPort.findByIdempotencyKey()` before calling `save()`.

---

## 9. Append-Only Audit Log

### Description

Audit tables are insert-only. `V4__ssdf_hardening.sql` adds a `raise_audit_immutable()` trigger function that raises an exception on any `UPDATE` or `DELETE` attempt against the audit tables, including from application database roles.

Audit tables: `admin_audit`, `notification_audit`, `rbac_audit`, `platform_admin_access_log`.

`rbac_audit` is automatically populated by triggers on `user_roles`, `role_permissions`, and `org_features` — ensuring RBAC changes are captured even if the application layer forgets to write the audit row.

### Rationale

An audit log that can be modified or deleted is not a reliable audit log. The trigger-level enforcement makes immutability unconditional — it cannot be bypassed by a missing application check, a direct database connection, or a future code change.

### Implementation

File: `migrations/V4__ssdf_hardening.sql`.

Audit tables have `created_at` only — no `updated_at` column, making the append-only intent visible in the schema.

### Example

```sql
CREATE FUNCTION raise_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'audit table "%" is immutable — UPDATE and DELETE are not permitted',
    TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_admin_audit_immutable
  BEFORE UPDATE OR DELETE ON admin_audit
  FOR EACH ROW EXECUTE FUNCTION raise_audit_immutable();
```

---

## 10. Snapshot Pattern

### Description

When a booking is created, certain fields from the meeting type template are copied directly onto the booking row. `bookings.appointment_type` is snapshotted from `meeting_types.appointment_type` at booking time. `booking_series.duration_minutes` is snapshotted from the meeting type at series creation.

### Rationale

Historical records must accurately reflect the state at the time of the event, not the current state of the template. If a host changes a meeting type from `ONLINE` to `IN_PERSON` after bookings have been made, existing bookings should still show the original appointment type. Snapshots insulate historical records from future template changes.

### Implementation

`bookings.appointment_type appointment_type` — column comment in `docs/schema-reference.sql`: "snapshotted V3".  
`booking_series.duration_minutes INT NOT NULL` — column comment: "snapshot — insulates occurrences from future type changes".

The use case copies the value at insert time; the column is never updated after the booking is created.

---

## 11. Soft Delete

### Description

Records are never physically deleted. Instead:

- `organizations` and `users` have a `deleted_at TIMESTAMPTZ` column. A non-null value means deleted.
- `org_members` uses `status = 'REMOVED'` rather than physical deletion.
- `meeting_types` uses `is_active = false` for archiving.

Prisma middleware automatically appends `WHERE deleted_at IS NULL` to all find queries so that soft-deleted records are invisible to normal application queries.

### Rationale

Physical deletion destroys the audit trail. Soft delete preserves foreign key integrity, allows data recovery, and satisfies audit requirements. It also supports right-to-erasure (GDPR) workflows: the `deleted_at` timestamp serves as the erasure marker, after which PII scrubbing can be applied separately.

### Implementation

Schema: `docs/schema-reference.sql` — `deleted_at TIMESTAMPTZ` on `organizations` and `users`.  
Prisma middleware: `src/infrastructure/persistence/`.

---

## 12. Seeded RBAC with System Role Protection

### Description

Roles and permissions are global, platform-seeded definitions deployed at startup via migration scripts. They are not created per-organisation. The `is_system = true` flag marks roles (`SUPER_ADMIN`, `ORG_ADMIN`, `MAINTAINER`) that cannot be deleted or demoted.

A V4 trigger (`trg_protect_system_roles`) raises an exception if any attempt is made to `DELETE` a system role or to set `is_system = false` on one.

`user_roles` is org-scoped: the same user can hold `ORG_ADMIN` in one hospital and `MEMBER` in another. `role_permissions` is global — all organisations get the same role-to-permission mapping.

Permission names follow the convention `resource:action` (e.g. `bookings:cancel`, `meeting_types:create`).

### Rationale

Seeding roles and permissions in migrations ensures every environment (development, staging, production) starts with an identical privilege baseline. System role protection prevents accidental or malicious removal of the SUPER_ADMIN role — a mistake that would lock out platform administrators with no recovery path.

### Implementation

Tables: `roles`, `permissions`, `role_permissions`, `user_roles` — `docs/schema-reference.sql`.  
Trigger: `trg_protect_system_roles` — `migrations/V4__ssdf_hardening.sql`.

---

## 13. Multi-Tenancy Org Picker

### Description

A single user can be a member of multiple organisations (e.g. a doctor working at two hospitals). The `org_members` table has no `UNIQUE(user_id)` constraint — it allows multiple rows per user across different organisations.

On login, `MembershipResolverService` finds all active `org_members` rows for the authenticated user. If the user belongs to more than one organisation, the frontend presents an org picker before loading the dashboard. Every subsequent request carries the selected org context in the session, and `SET LOCAL app.current_organization_id` scopes all database queries to that org via RLS.

### Rationale

Healthcare scheduling platforms commonly require staff to operate across multiple sites. Forcing one account per organisation would require users to maintain separate credentials and organisations to manage duplicate user records.

### Implementation

Table: `org_members` — `UNIQUE (organization_id, user_id)` ensures one membership row per user per org, but no constraint prevents a user from appearing in multiple orgs.  
Service: `src/auth/application/` — `MembershipResolverService`.

---

## 14. Platform Admin Bypass

### Description

Super Admins operate across all organisations. They are recorded in the `platform_admins` table, which has no `organization_id` column and no RLS policy.

After JWT validation, `AuthplexJwtGuard` checks whether the authenticated user appears in `platform_admins`. If so, it sets `principal.isPlatformAdmin = true` on the request. `PlatformAdminGuard` protects all `/platform/**` routes.

Every cross-org action taken by a Super Admin is written to `platform_admin_access_log`, an append-only table (see Pattern 9). The `revoked_at` / `revoked_by` columns on `platform_admins` (added in V4) allow Super Admin access to be revoked with a full audit trail.

### Rationale

A small number of platform operators need read/write access across all tenant organisations for support, billing, and compliance purposes. This access must be audited completely and must not use the same RLS mechanism as tenant users, since it needs to bypass org isolation by design.

### Implementation

Tables: `platform_admins`, `platform_admin_access_log` — `docs/schema-reference.sql`.  
Guard: `src/auth/infrastructure/http/`.  
Trigger: `trg_platform_admins_no_deleted_user` — prevents granting admin to a soft-deleted user.

---

## 15. ClockPort / IdGeneratorPort (Testability Seams)

### Description

Use cases never call `new Date()` or `crypto.randomUUID()` directly. Instead, they depend on two interfaces injected via the NestJS DI container:

- `ClockPort.now(): Date` — returns the current time.
- `IdGeneratorPort.generate(): string` — returns a new UUID.

Production bindings: `SystemClockAdapter` (wraps `new Date()`) and `UuidIdGeneratorAdapter` (wraps `crypto.randomUUID()`).  
Test bindings: `FakeClock` (returns a fixed timestamp) and `SequentialIdGenerator` (returns predictable IDs like `id-1`, `id-2`).

### Rationale

Global state (`Date.now()`, `crypto.randomUUID()`) cannot be controlled in unit tests without patching module globals, which is fragile and environment-dependent. By injecting clock and ID generation as ports, tests can provide deterministic implementations. A test that asserts `booking.createdAt === '2024-01-15T10:00:00Z'` does not depend on when it runs.

### Implementation

Files:  
`src/shared-kernel/domain/clock.port.ts`  
`src/shared-kernel/domain/id-generator.port.ts`  
`src/infrastructure/clock/`  
`src/infrastructure/id-generator/`

```typescript
// clock.port.ts
export interface ClockPort {
  now(): Date;
  nowUtc(): Date;
}
export const CLOCK_PORT = Symbol('ClockPort');

// id-generator.port.ts
export interface IdGeneratorPort {
  generate(): string;
}
export const ID_GENERATOR_PORT = Symbol('IdGeneratorPort');
```

---

## 16. SELECT FOR UPDATE SKIP LOCKED (Safe Concurrent Queue Processing)

### Description

The notification worker polls the outbox table to claim unprocessed rows:

```sql
SELECT * FROM outbox
WHERE status IN ('PENDING', 'FAILED')
  AND (next_attempt_at IS NULL OR next_attempt_at <= now())
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

`FOR UPDATE` locks the selected rows. `SKIP LOCKED` causes the query to skip rows that are already locked by another worker instance. This allows multiple worker processes to run concurrently without distributed locks and without double-processing any row.

Status transitions: `PENDING` → `DONE` (success) or `FAILED` (retryable error) or `DEAD` (maximum retries exhausted).

### Rationale

BullMQ provides job-level deduplication, but the outbox table is the source of truth. `SKIP LOCKED` is the standard PostgreSQL pattern for concurrent queue consumers: it is efficient (no lock contention, no blocking), correct (each row is processed by exactly one consumer at a time), and requires no external coordination service.

### Implementation

Worker: `apps/notification-worker/`.  
Index: `CREATE INDEX idx_outbox_drain ON outbox(status, next_attempt_at) WHERE status IN ('PENDING', 'FAILED')` — supports efficient polling.

---

## 17. DB-Level Invariant Enforcement (V4)

### Description

Application-layer validation is advisory. The database is the final enforcer of data correctness. V4 adds several CHECK constraints and trigger functions that make invalid states unrepresentable at the storage layer:

| Constraint / Trigger | Table | Rule |
|---|---|---|
| `chk_meeting_type_recurrence` | `meeting_types` | `recurrence_rule` required when `is_recurring = true` |
| `chk_series_recurrence_rule` | `booking_series` | `recurrence_rule` must contain `frequency` and `interval` keys |
| `chk_weekly_rules_shape` + `validate_weekly_rules()` | `availability_schedules` | `weekly_rules` must be a non-empty array; each element must have `dayOfWeek`, `startTime`, `endTime` |
| `chk_token_expires_after_created` | `booking_tokens` | `expires_at > created_at` |
| `chk_token_used_after_created` | `booking_tokens` | `used_at >= created_at` if not null |
| `trg_protect_system_roles` | `roles` | Blocks `DELETE` of system roles and unsetting `is_system` |
| `trg_platform_admins_no_deleted_user` | `platform_admins` | Blocks granting admin to a soft-deleted user |

### Rationale

Application-layer validation can be bypassed by direct database access, future code changes, migration scripts, or bugs. DB-level constraints are unconditional. They protect against both application bugs and operator mistakes.

### Implementation

File: `migrations/V4__ssdf_hardening.sql`

```sql
-- Example: validate_weekly_rules ensures shape integrity on JSONB
CREATE FUNCTION validate_weekly_rules(rules JSONB)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE element JSONB;
BEGIN
  IF jsonb_typeof(rules) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(rules) = 0    THEN RETURN false; END IF;
  FOR element IN SELECT jsonb_array_elements(rules) LOOP
    IF NOT (element ? 'dayOfWeek' AND element ? 'startTime' AND element ? 'endTime')
    THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE availability_schedules
  ADD CONSTRAINT chk_weekly_rules_shape CHECK (validate_weekly_rules(weekly_rules));
```

---

## 18. One-Time Token Pattern (Booking Tokens)

### Description

Guests receive a signed URL in their confirmation email that allows them to reschedule or cancel their booking without creating an account. The token is generated once and never stored in raw form — only its SHA-256 hash is persisted in `booking_tokens`.

On redemption, the use case:
1. Hashes the raw token from the URL.
2. Looks up the hash in `booking_tokens`.
3. Rejects if `expires_at < now()` or `used_at IS NOT NULL`.
4. Sets `used_at = now()` atomically before taking the action.

The `action` column is an enum (`RESCHEDULE | CANCEL`). A token issued for cancellation cannot be used to reschedule, and vice versa.

### Rationale

Storing the raw token would allow a database breach to expose valid tokens. Hashing ensures that even with full read access to the database, an attacker cannot reconstruct usable tokens. Single-use enforcement (`used_at`) prevents replay attacks. TTL enforcement (`expires_at`) limits the window of exposure.

### Implementation

Table: `booking_tokens` — `docs/schema-reference.sql`.  
Port: `src/booking/domain/ports/outbound/token-vault.port.ts`.  
Temporal integrity enforced by V4 CHECK constraints (`chk_token_expires_after_created`, `chk_token_used_after_created`).

```sql
CREATE TABLE booking_tokens (
  token_hash  TEXT         NOT NULL UNIQUE,  -- SHA-256; raw token never stored
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  action      token_action NOT NULL,         -- RESCHEDULE | CANCEL
  CONSTRAINT chk_token_expires_after_created CHECK (expires_at > created_at),
  CONSTRAINT chk_token_used_after_created    CHECK (used_at IS NULL OR used_at >= created_at)
);
```

---

## 19. Cache-Bust SSE (Real-Time is Push-Only)

### Description

Real-time updates use a push-only signal pattern rather than pushing state over the wire.

1. After the notification worker successfully processes an outbox event, it publishes a lightweight signal to a Redis pub/sub channel. The signal contains only the event type and the booking ID — no full payload.
2. The core API maintains a Server-Sent Events (SSE) endpoint. Its SSE handler subscribes to the Redis channel and forwards the signal to connected browser clients.
3. The browser's `useRealtimeChannel` hook listens to the SSE stream. On receiving a signal, it calls `queryClient.invalidateQueries()` with the relevant query key.
4. The invalidated query re-fetches fresh data from the core API.

The core API is always the authoritative source of truth. If a signal is missed (network gap, browser tab in background), the next user interaction triggers a re-fetch anyway.

### Rationale

Pushing full state over SSE creates consistency risks: the SSE payload could arrive out of order, be partially applied, or conflict with a concurrent fetch. Pushing only a cache-bust signal keeps the SSE channel stateless. The browser always reads from the API, which reads from the database with full RLS and business logic applied.

### Implementation

Worker publisher: `apps/notification-worker/` — Redis pub/sub after outbox row transitions to `DONE`.  
SSE handler: `src/booking/infrastructure/http/` — subscribes to Redis and streams to `EventSource`.  
Real-time port: `src/booking/domain/ports/outbound/realtime-publisher.port.ts`.  
Frontend hook: `apps/web/src/` — `useRealtimeChannel`.

---

## 20. JSONB with Shape Validation

### Description

Semi-structured configuration data is stored as `JSONB` columns rather than fully normalised tables. Required key presence is enforced by PostgreSQL CHECK constraints directly on the column. Complex shape validation uses dedicated PL/pgSQL functions (see Pattern 17).

| Column | Table | Validation |
|---|---|---|
| `recurrence_rule` | `meeting_types`, `booking_series` | CHECK: must contain `frequency` and `interval` keys |
| `weekly_rules` | `availability_schedules` | `validate_weekly_rules()`: non-empty array, each element has `dayOfWeek`/`startTime`/`endTime` |
| `buffer_config_json` | `meeting_types` | Application-layer validation; default `{"beforeMinutes":0,"afterMinutes":0}` |
| `questions_json` / `answers_json` | `meeting_types`, `bookings`, `booking_attendees` | Application-layer validation |
| `branding_json` | `organizations` | Application-layer validation |

### Rationale

Fully normalised tables for recurrence rules or weekly schedules would require many joins and make schema evolution expensive. JSONB allows the shape to evolve without migrations for optional fields, while CHECK constraints on required keys prevent invalid data from being stored. The combination provides flexibility without sacrificing correctness.

### Implementation

Schema: `docs/schema-reference.sql`.  
Validation function: `validate_weekly_rules()` — `migrations/V4__ssdf_hardening.sql`.

```sql
-- Presence check on required JSONB keys
CONSTRAINT chk_series_recurrence_rule
  CHECK (recurrence_rule ? 'frequency' AND recurrence_rule ? 'interval')

-- Shape validation via function
CONSTRAINT chk_weekly_rules_shape
  CHECK (validate_weekly_rules(weekly_rules))
```

Full shape validation beyond key presence (type checking, value ranges, enum membership) is handled in the application layer before the database write.
