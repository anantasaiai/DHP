# Implementation Guide

## Modules (Bounded Contexts)

| Context | Path | Responsibility |
|---|---|---|
| `auth` | `src/auth/` | JWT validation, OIDC/JWKS, user provisioning, subscription gate |
| `booking` | `src/booking/` | Booking lifecycle (create, reschedule, cancel), real-time push |
| `meeting-types` | `src/meeting-types/` | Appointment type template CRUD (duration, questions, consultation type) |
| `organization` | `src/organization/` | Org management, membership, invites |
| `availability` | `src/availability/` | Weekly schedules, per-day overrides, slot querying |
| `shared-kernel` | `src/shared-kernel/` | Result type, Clock port, IdGenerator port |
| `infrastructure` | `src/infrastructure/` | PrismaService, system clock, UUID generator |
| `health` | `src/health/` | `/health` (liveness), `/readiness` (DB + Redis) |
| `platform` | `src/platform/` | Super Admin org CRUD, Org Admin assignment, platform stats |
| `feature-flags` | `src/feature-flags/` | Feature flag read/toggle per org (Org Admin only) |
| `rbac` | `src/rbac/` | Role-permission management, user-role assignment (Org Admin only) |

---

## Auth Module

### Guards (applied globally in `app.module.ts`)

```
Request → ThrottlerGuard → AuthplexJwtGuard → PlatformAdminGuard (platform routes only) → RbacGuard → Controller
```

**`AuthplexJwtGuard`** — validates Bearer token against JWKS:
- Skips routes decorated with `@PublicEndpoint()`
- Verifies signature via `JwksCache` (auto-refreshes on unknown `kid`)
- Validates `iss` and `aud` claims from env
- Attaches `Principal` (userId, organizationId, role (MemberRole: ADMIN/MEMBER/MAINTAINER), isPlatformAdmin (boolean), subscriptionStatus) to request
- Returns 402 if subscription status is `CANCELLED` or `PAST_DUE`

**`PlatformAdminGuard`** — applied only to `/platform/**` routes. Checks `isPlatformAdmin` on the Principal; returns 403 if false.

**`RbacGuard`** — checks `@RequireRoles(...)` metadata. No metadata = any authenticated user.

**`JwksCache`** — wraps `jose.createRemoteJWKSet` pointed at `OIDC_JWKS_URI`. Requires `X-Tenant-ID` header for AuthPlex's multi-tenant JWKS endpoint.

Three org-scoped roles: `ADMIN`, `MEMBER`, `MAINTAINER`. A fourth cross-org role, `SUPER_ADMIN`, is handled by `PlatformAdminGuard` on `/platform/**` routes.

### BFF Login (`POST /auth/login`)

Full server-side flow — the browser POSTs credentials and receives a JWT:

1. `POST /login` to AuthPlex → `{ data: { session_token } }`
2. Generate PKCE `code_verifier` + `code_challenge` (sha256/base64url)
3. `GET /authorize?response_type=code&code_challenge=...` with `Authorization: Bearer <session_token>` — follows 302 redirect manually
4. Extract `?code=` from `Location` header
5. `POST /token` with `grant_type=authorization_code&code=...&code_verifier=...`
6. `jwtVerify()` the returned access token
7. Upsert org + user + membership via `ProvisionUserUseCase`
8. Return `{ access_token, principal }`

### User Provisioning (`POST /auth/provision`)

`ProvisionUserUseCase` is idempotent on `userId` (= OIDC `sub`):
1. Find existing user → if found, continue; otherwise create organization (slug derived from email prefix) + user + ADMIN membership in one transaction
2. `MembershipResolverService` finds ALL active `org_members` rows for the user
3. If user belongs to multiple orgs → response includes `orgs: [...]` and frontend shows org picker
4. If only one org → org context is set automatically (behaves as before)
5. Also checks `platform_admins` table and sets `isPlatformAdmin` on the returned Principal

---

## Booking Module

### Ports

| Port | Direction | Purpose |
|---|---|---|
| `BookSlotUseCase` | Inbound | Creates a booking |
| `CancelBookingUseCase` | Inbound | Cancels with reason |
| `RescheduleBookingUseCase` | Inbound | Atomically shifts slot |
| `BookingRepository` | Outbound | Persistence |
| `EventPublisher` | Outbound | Writes to outbox (same tx) |
| `RealtimePublisher` | Outbound | SSE notification (post-commit) |
| `EmailDispatcher` | Outbound | Sends guest/host confirmation |
| `CalendarProvider` | Outbound | Google Calendar / Outlook sync |
| `MeetingProvider` | Outbound | Zoom / Google Meet link |
| `TokenVault` | Outbound | AES-256 envelope encryption for OAuth tokens |
| `AiProposal` | Outbound | Time-slot suggestions from ai-service |

### Idempotency

Every booking write accepts an `Idempotency-Key` header. The use case checks for an existing booking with the same key before inserting. Duplicate requests return the original response without side effects.

### Double-booking Prevention

The database `EXCLUDE` constraint is the enforcer:

```sql
EXCLUDE USING gist (
  host_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
)
```

Any overlapping booking for the same host raises a constraint violation. The application catches this and returns 409. Application-level slot checking is advisory only (for UX feedback before the final write).

### Transactional Outbox

`BookSlotUseCase` inserts the booking and an outbox record in the same `BEGIN/COMMIT`. The notification-worker polls the outbox using `SELECT ... FOR UPDATE SKIP LOCKED`, dispatches email/webhooks, then marks the record `DONE`. This guarantees at-least-once delivery without dual-write risk.

---

## Meeting Types Module

Meeting types are templates an organization configures. Each type has:
- Duration, buffer before/after, min notice, max days in advance, max per day
- Conferencing type (`google_meet | zoom | teams | webex | custom`)
- Questions for guest intake (text, select, multiselect, checkbox), each with options

Questions and options are normalized into separate tables (`meeting_type_questions`, `meeting_type_question_options`) rather than stored as JSONB, so they can be queried and reordered without JSON parsing.

---

## Availability Module

### Schedule → Rule → Override

```
AvailabilitySchedule  (timezone, is_default)
  └── AvailabilityRule[]  (day_of_week 0-6, start_time, end_time)

AvailabilityOverride  (date, available, start_time?, end_time?)
```

Slot availability queries:
1. Find the relevant schedule (org + user, preferring `is_default=true`)
2. Get rules for the requested day-of-week
3. Apply any overrides for the specific date (override wins)
4. Subtract booked intervals from the resulting windows

---

## Swagger / OpenAPI

The Core API serves a live OpenAPI spec at `/api/docs` (UI) and `/api/docs-json` (raw JSON). The spec is generated at startup from `@nestjs/swagger` decorators — no separate YAML file to maintain.

### Conventions

Every controller must carry:

```typescript
@ApiTags('bookings')          // groups endpoints in the UI sidebar
@ApiBearerAuth()              // marks the lock icon; tells clients to send Authorization: Bearer
@Controller('api/v1/bookings')
export class BookingController { ... }
```

Every endpoint method must carry:

```typescript
@ApiOperation({ summary: 'Create a booking (idempotent)' })
@ApiResponse({ status: 201, description: 'Booking confirmed' })
@ApiResponse({ status: 409, description: 'SLOT_CONFLICT_DETECTED' })
```

Public endpoints that take a request body also need `@ApiBody` with an inline schema or a DTO class annotated with `@ApiProperty`.

### Authenticating in the Swagger UI

1. Start core-api and open http://localhost:3000/api/docs
2. Call `POST /auth/login` (under the **auth** tag) with your credentials
3. Copy the `access_token` from the response body
4. Click **Authorize** (top-right padlock) and paste the token
5. All subsequent requests in the UI carry `Authorization: Bearer <token>`

### Using the spec outside the browser

```bash
# Import into Postman / Insomnia
curl http://localhost:3000/api/docs-json -o dhp-openapi.json

# Or point your client generator at the live endpoint
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/api/docs-json \
  -g typescript-fetch \
  -o packages/api-client/src
```

---

## Adding a Feature (Vertical Slice)

```
1. Domain model         src/<context>/domain/model/<entity>.ts
2. Outbound port        src/<context>/domain/ports/<repo-or-service>.port.ts
3. Inbound port         src/<context>/domain/ports/<use-case>.use-case.ts
4. Use case impl        src/<context>/application/<use-case>.ts
5. Adapter              src/<context>/infrastructure/persistence/<prisma-repo>.ts
6. Controller + DTOs    src/<context>/infrastructure/http/<context>.controller.ts
7. Wire DI              src/app.module.ts (or context module)
8. Shared types         packages/types/src/<context>.types.ts
9. Web feature          apps/web/src/features/<feature>/
```

**Hard rule:** If you're importing `@nestjs/*`, `@prisma/client`, or any HTTP/IO library inside `domain/` or `application/`, the port boundary is drawn wrong. Move the import to `infrastructure/`.

---

## Key Conventions

### Tenant Isolation
Every repository query includes `where: { organizationId: principal.organizationId }`. PostgreSQL RLS policies are the backstop — a leaked query would still hit RLS and return empty rather than cross-tenant data.

Multi-org users (e.g. healthcare providers credentialed at multiple hospitals or clinics) have multiple `org_members` rows. The session carries a single `organizationId` chosen at login. All queries use that session-scoped org ID.

### Enums
All Prisma enums must carry `@@map("snake_case_pg_type")` to match the Flyway-created PostgreSQL types. Adding an enum without `@@map` will break `prisma generate` against the live schema.

### Migrations
All schema changes go in `migrations/V{n}__{description}.sql`. Never edit an already-applied file — always add a new version. AuthPlex schema changes go in `authplex/internal/adapter/postgres/migrations/` as numbered SQL files (embedded in the Go binary at build time).

### No Dual-Write
The outbox event and the state change are always in the same Postgres transaction. Never write to Redis, SQS, or any external system inside a database transaction.

### Real-time is Push-Only
The notification-worker publishes a lightweight event to Redis after processing the outbox. The SPA's `EventSource` receives the event and triggers a TanStack Query invalidation, which re-fetches from the Core API. The SSE event never carries state — it's a cache-bust signal only.

### Result Type
Use `Result<T, E>` from `src/shared-kernel/domain/result.ts` in domain and application layers. Never throw inside the domain or application — throw only at the infrastructure boundary (e.g., in Prisma adapters or HTTP controllers), and only after translating domain errors to HTTP status codes.

### Audit Immutability
All audit tables (`admin_audit`, `notification_audit`, `rbac_audit`, `platform_admin_access_log`) are append-only. V4 triggers raise an exception on any UPDATE or DELETE attempt. Application code must never attempt to modify audit records.

---

## Platform Module (Super Admin)

Routes (all protected by `PlatformAdminGuard`, no org RLS):

- `GET /platform/stats` — platform-wide aggregate stats (total orgs, users, bookings)
- `GET /platform/orgs` — list organizations
- `POST /platform/orgs` — create organization
- `PATCH /platform/orgs/:id` — update org
- `DELETE /platform/orgs/:id` — soft-delete org
- `GET /platform/orgs/:id/admins` — list Org Admins for an org
- `POST /platform/orgs/:id/admins` — assign an Org Admin
- `DELETE /platform/orgs/:id/admins/:userId` — remove Org Admin

Every action writes to `platform_admin_access_log`.

---

## Feature Flags Module (Org Admin only)

Routes (protected by `@RequireRoles('ADMIN')`):

- `GET /feature-flags` — list all features + the org's enabled/disabled state for each
- `PATCH /feature-flags/:flagName` — enable or disable a feature for this org

Backed by `features` (global catalogue) + `org_features` (per-org state). Changes are auto-logged to `rbac_audit` via DB trigger.

---

## RBAC Module (Org Admin only)

Routes (protected by `@RequireRoles('ADMIN')`):

- `GET /rbac/roles` — list available roles with their permissions
- `GET /rbac/user-roles` — list user-role assignments in this org
- `POST /rbac/user-roles` — assign a role to a user (writes to `user_roles`, triggers `rbac_audit`)
- `DELETE /rbac/user-roles/:id` — revoke role from user

---

## Environment Variables

### Core API (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Prisma connection string |
| `REDIS_URL` | BullMQ + real-time pub/sub |
| `OIDC_ISSUER` | AuthPlex base URL (also JWT `iss` claim) |
| `OIDC_AUDIENCE` | JWT `aud` claim — must match AuthPlex client_id |
| `OIDC_CLIENT_ID` | AuthPlex client identifier |
| `OIDC_CLIENT_SECRET` | AuthPlex client secret (BFF token exchange) |
| `OIDC_JWKS_URI` | JWKS endpoint (`{OIDC_ISSUER}/jwks` for AuthPlex) |
| `OIDC_TENANT_ID` | AuthPlex tenant UUID (sent as `X-Tenant-ID` header to JWKS) |
| `OIDC_REDIRECT_URI` | Registered redirect URI (`http://localhost:5173/auth/callback`) |
| `SERVICE_TOKEN_SECRET` | HMAC secret for core-api → ai-service calls |
| `TOKEN_VAULT_KEY` | AES-256 key for OAuth token encryption |
| `WEBHOOK_SIGNING_SECRET` | HMAC-SHA256 for outgoing webhook signatures |

### Web (`apps/web/.env.local`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Core API origin (`http://localhost:3000`) |
| `VITE_OIDC_ISSUER` | AuthPlex base URL (informational only — not used for redirects) |
| `VITE_OIDC_CLIENT_ID` | OIDC client identifier |
| `VITE_OIDC_REDIRECT_URI` | Redirect URI registered with AuthPlex |

---

## Local Dev Credentials (Seeded)

The AuthPlex dev seed migration (`022_seed_dhp_dev.sql`) inserts these on first startup:

| Field | Value |
|---|---|
| Email | `ananta.sai@tekisho.ai` |
| Password | `Admin@1234` |
| Tenant UUID | `4aa2670c-2a50-5851-a4e4-f4931e6f49e5` |
| Client ID | `5BOOTLIGWdWN9Y1OYrjk7A` |

On first login, `ProvisionUserUseCase` creates the DHP org + user + ADMIN membership automatically.

---

## Observability (Local)

Start the observability stack from the hams project:

```bash
cd /path/to/hams
docker compose up -d prometheus grafana tempo
```

| Tool | URL | Purpose |
|---|---|---|
| Grafana | http://localhost:3000 | Dashboards |
| Prometheus | http://localhost:9090 | Metrics |
| Tempo | http://localhost:3200 | Distributed traces |
| Mailhog | http://localhost:8025 | Catch outgoing email in dev |
