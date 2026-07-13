# Components Reference

Every component across the DHP monorepo with a detailed explanation of what it does, why it exists, and how it connects to the rest of the system.

---

## Web App (`apps/web`)

### Pages

#### `LoginPage` — `features/auth/LoginPage.tsx` · Route: `/login` · Public

The entry point for all authenticated users. It renders a simple email and password form and submits credentials via `POST /auth/login` to the Core API. The page never interacts with AuthPlex directly — that is intentional. All OIDC token exchange happens server-side in the Core API (BFF pattern), so the browser only ever sees a JSON request and a JSON response.

On a successful response the page receives `{ access_token, principal }`, calls `useAuthStore.setTokens()` to store them, and navigates to `/dashboard`. On failure it displays an inline error message. There is no redirect loop, no PKCE state in the URL, and no OIDC library on the client — just a fetch call.

#### `CallbackPage` — `features/auth/CallbackPage.tsx` · Route: `/auth/callback` · Public

Handles the case where AuthPlex redirects the browser back with an authorization code — for example if a future flow initiates PKCE from the browser side, or when an external link targets the callback URL. It reads `?code=` and `?state=` from the URL, then calls `POST /auth/callback` on the Core API to exchange the code for a token. The Core API does the actual token exchange with AuthPlex and returns `{ access_token, principal }`.

#### `DashboardPage` — `features/dashboard/DashboardPage.tsx` · Route: `/dashboard` · Protected

The main landing page after login. The dashboard is role-aware: the component reads `principal.role` and `principal.isPlatformAdmin` from `useAuthStore` and renders a different shell depending on the caller's role:
- **Super Admin** (`isPlatformAdmin = true`): platform stats cards (total orgs, active subscriptions, total bookings), org management table, assign-org-admin drawer.
- **Org Admin** (`role = 'ADMIN'`): org-level stats (total members, active maintainers, bookings today, cancellations this week), member management panel, feature flag toggles, RBAC assignment matrix.
- **Maintainer** (`role = 'MAINTAINER'`): personal slot stats (upcoming bookings, utilisation %, next booking time), availability calendar, booking list with cancel/reschedule actions, appointment type selector (Online / In-person).

Requires a valid access token — `ProtectedRoute` guards this route. If the user belongs to multiple orgs and has not yet selected one, they are redirected to `/org-select` first.

#### `OrgSelectPage` — `features/auth/OrgSelectPage.tsx` · Route: `/org-select` · Protected

Shown when a user who belongs to multiple organizations logs in. Lists all orgs the user is an active member of (fetched from `/auth/orgs`), lets them pick one, and calls `POST /auth/select-org` with the chosen `organizationId`. The Core API responds with a scoped access token tied to that org. The page then calls `useAuthStore.setTokens()` with the new token and navigates to `/dashboard`. Users who belong to only one org skip this page entirely — the Core API sets org context automatically during provisioning.

#### `MeetingTypesPage` — `features/meeting-types/MeetingTypesPage.tsx` · Route: `/meeting-types` · Protected

The CRUD interface for appointment type templates. Healthcare providers create, edit, and archive appointment types here. Each appointment type defines what a bookable slot looks like: its name, duration, buffer windows, consultation provider, and the intake questions asked of patients. Data is fetched via TanStack Query hooks from `lib/api/meeting-types.ts` and mutations invalidate the relevant query keys.

#### `BookingPage` — `features/booking/BookingPage.tsx` · Route: `/bookings/:id` · Protected

Shows the detail view of a single booking: the guest's name, email, answers to intake questions, the meeting join URL, and the current status. Also provides cancel and reschedule actions for the host. Uses the booking ID from the URL param to fetch from the Core API.

#### `PublicBookingPage` — `features/booking/PublicBookingPage.tsx` · Route: `/:orgSlug/:username/:meetingSlug` · Public

The patient-facing booking flow. No login required. The URL encodes all the context needed to identify the appointment type: the organization slug, the healthcare provider's username, and the appointment type slug. The page fetches the provider's availability for a given date range, renders a time-slot picker, collects the patient's name, email, and answers to intake questions, and submits `POST /api/v1/bookings`.

This route is the only externally shareable URL — healthcare providers send it to patients. It is intentionally decoupled from the authenticated dashboard so patients never need an account.

#### `SubscriptionExpiredPage` — `features/subscription/SubscriptionExpiredPage.tsx` · Route: `/subscription-required` · Public

Rendered when the Core API returns HTTP 402 (Payment Required). The `AuthplexJwtGuard` returns 402 when the organization's subscription status is `CANCELLED` or `PAST_DUE`. The API client in `lib/api/client.ts` intercepts 402 responses globally and navigates to this page, asking the user to update their billing details.

---

### Layout Components

#### `ProtectedRoute` — `components/layout/ProtectedRoute.tsx`

A React Router wrapper component that checks whether `useAuthStore` has a token. If no token is present, it redirects to `/login`. If a token is present, it renders its children.

It is important to understand what this component does and does not do: it provides a smooth UX so users are not shown a blank protected page before being redirected, but it does not enforce security. Security is enforced server-side by `AuthplexJwtGuard` on every API call. A user who manipulates localStorage to fake a token will pass `ProtectedRoute` but receive 401 from every API endpoint.

---

### Router — `App.tsx`

Defines the full client-side route tree using React Router v6. Routes are split into two groups: public routes (LoginPage, CallbackPage) are eagerly bundled so they load instantly, while authenticated and infrequently-visited routes (DashboardPage, BookingPage, etc.) are lazy-loaded with `React.lazy()` and wrapped in `Suspense`. This keeps the initial bundle small for guest users who only visit the public booking page.

---

### State Management

#### `useAuthStore` — `store/auth.store.ts`

A Zustand store that is the single source of truth for authentication state across the entire SPA. It holds two pieces of data: the `accessToken` (a JWT string) and the `principal` (a plain object with `userId`, `organizationId`, `role`, `subscriptionStatus`).

The store uses Zustand's `persist` middleware to write to `localStorage` under the key `dhp-auth`. Critically, only the `principal` is persisted to localStorage — the token is held in memory only. This means the token is gone on page refresh, which forces a re-login when the JWT expires (the stored principal lets the app show the user's name while the login redirect is happening). Storing tokens in localStorage is a security anti-pattern because they are accessible to JavaScript; keeping them in memory eliminates XSS-based token theft.

Key methods on the store:
- `setTokens(accessToken, principal)` — called by LoginPage and CallbackPage on successful auth
- `logout()` — clears both values and navigates to `/login`; called by the API client on 401

---

### API Client

#### `lib/api/client.ts`

A thin wrapper around the browser's `fetch` API. It is the single point through which all authenticated requests flow. On every call it reads the current `accessToken` from `useAuthStore` and attaches it as `Authorization: Bearer <token>`. It also handles two error cases globally:
- **401 Unauthorized** — calls `useAuthStore.logout()`, which redirects to `/login` and clears the stored token
- **402 Payment Required** — navigates to `/subscription-required`

This centralised handling means individual page components do not need to handle auth failures themselves.

#### `lib/api/meeting-types.ts`

TanStack Query hooks that wrap meeting type CRUD operations. Each hook composes `lib/api/client.ts` with a Query or Mutation and a query key from `lib/query-keys/index.ts`. Separating these hooks into their own file keeps page components free of data-fetching boilerplate and makes the hooks reusable across multiple pages.

---

### Utilities

#### `lib/query-keys/index.ts`

A factory object that produces TanStack Query cache keys. All cache keys in the app are defined here rather than as ad-hoc strings scattered across components. This matters because TanStack Query's cache invalidation is key-based: if a mutation and a query use slightly different key strings, the cache never invalidates and the UI shows stale data. Centralising keys eliminates that class of bug.

#### `lib/realtime/useRealtimeChannel.ts`

A React hook that opens a browser `EventSource` connection (SSE) to a Core API endpoint and subscribes to real-time events for the current organization. When an event arrives (e.g., a booking was confirmed or cancelled), the hook calls `queryClient.invalidateQueries(...)` with the affected keys, which causes TanStack Query to silently re-fetch the relevant data.

The hook deliberately ignores the event payload — it treats every event as a cache-bust signal rather than trying to apply the payload as a state patch. This keeps the real-time layer simple: the server is always the source of truth, and the SPA always re-reads from it.

---

## Core API (`apps/core-api`)

### Entry Points

#### `main.ts`

The application bootstrap file. It creates a NestJS application using the Fastify adapter (not the default Express), which provides lower memory usage and higher throughput. It sets up Swagger (OpenAPI spec at `/api/docs`), enables CORS for the configured `FRONTEND_URL`, attaches graceful shutdown hooks so in-flight requests complete before the process exits, and starts listening on the configured `PORT` (default 3000).

Swagger is configured with `addBearerAuth()` so every endpoint that requires authentication shows a padlock icon in the UI. The spec is generated entirely from decorators on controllers — no separate YAML file exists.

#### `app.module.ts`

The root NestJS DI module. This is where everything is wired together. It imports the three feature modules (`AuthModule`, `MeetingTypesModule`, `OrganizationModule`), registers global providers (Prisma, clock, ID generator), configures global guards (`AuthplexJwtGuard`, `RbacGuard`, throttling), and directly registers the booking module's controllers and adapters since the booking context is the most heavily connected and wires its ports manually for clarity.

`ConfigModule` is registered globally so environment variables are available everywhere. `LoggerModule` (pino) is also global, configured to redact sensitive headers (`authorization`, `x-api-key`) from structured logs. `ThrottlerModule` is global and limits all endpoints to 60 requests per minute per IP by default, with route-level overrides for the public booking endpoint.

---

### Auth Module (`src/auth/`)

#### `AuthplexJwtGuard` — `infrastructure/authplex-jwt.guard.ts`

A NestJS global APP_GUARD that runs on every incoming request. It first checks for the `@PublicEndpoint()` decorator — if present, it skips validation entirely. Otherwise it extracts the Bearer token from the `Authorization` header, verifies it using `jose.jwtVerify` against the cached JWKS, and validates the `iss` and `aud` claims against `OIDC_ISSUER` and `OIDC_AUDIENCE` from environment variables.

On success it constructs a `Principal` value object and attaches it to `req.user`. On failure it throws `UnauthorizedException` (401). If the token is valid but the organization's `subscriptionStatus` is `CANCELLED` or `PAST_DUE`, it throws `PaymentRequiredException` (402) — the subscription gate that locks out lapsed orgs before they can make any API call.

#### `RbacGuard` — `infrastructure/rbac.guard.ts`

A NestJS global APP_GUARD that runs after `AuthplexJwtGuard` (guard order is determined by registration order in `app.module.ts`). It reads `@RequireRole(...)` metadata from the route handler. If no metadata is present, any authenticated user is allowed. If metadata is present, it compares `req.user.role` against the required role and throws `ForbiddenException` (403) on mismatch.

Three org-scoped roles are supported: `ADMIN` (Org Admin — manages users, RBAC, feature flags, can book/cancel/reschedule), `MEMBER` (deprecated base role), and `MAINTAINER` (slot owner — manages own availability, can book/cancel/reschedule). A fourth cross-org role, Super Admin, is handled separately by `PlatformAdminGuard`. Org-scoped roles are stored in `org_members.role` for the coarse gate and in `user_roles` for fine-grained permission assignments.

#### `JwksCache` — `infrastructure/jwks.cache.ts`

Wraps `jose.createRemoteJWKSet` and is initialized on module startup via `OnModuleInit`. It fetches and caches the public JWK set from `OIDC_JWKS_URI` with a 10-minute cache TTL. Crucially, it sends the `X-Tenant-ID` header on every JWKS request — AuthPlex's JWKS endpoint is multi-tenant and returns an empty key set if the tenant header is missing, which would cause every JWT verification to fail.

The underlying `jose` library handles key rotation transparently: if it encounters a JWT with a `kid` not in the current cache, it automatically re-fetches the JWKS to pick up newly rotated keys.

#### `@PublicEndpoint()` — `infrastructure/public-endpoint.decorator.ts`

A metadata decorator applied to controller methods that should be accessible without a JWT. Examples: `POST /auth/login`, `POST /auth/callback`, `GET /health`. The `AuthplexJwtGuard` reads this metadata via `Reflector` and skips validation when it is present. Without this decorator, the guard would reject every request to public endpoints with 401.

#### `AuthController` — `infrastructure/http/auth.controller.ts`

Handles the three authentication-related HTTP endpoints. It holds references to `JwksCache` (for token validation during provisioning) and `ProvisionUserUseCase` (for first-login user creation). It reads `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, and `OIDC_AUDIENCE` from environment variables at construction time.

The `POST /auth/login` handler is the heart of the BFF pattern: it performs the complete server-side OIDC flow (login → authorize → token exchange), validates the returned JWT, provisions the user, and returns a clean `{ access_token, principal }` to the browser.

#### `ProvisionUserUseCase` — `application/provision-user.use-case.ts`

Ensures every authenticated user has a corresponding record in the DHP database. On every login, after the JWT is validated, this use case runs. It looks up the user by their OIDC `sub` claim. If found, it returns the existing principal. If not found, it creates an `Organization` (slug derived from the email prefix), a `User` record (id = OIDC sub), and an `ADMIN` `Membership` linking them — all in a single database transaction.

This is idempotent by design. Multiple concurrent first-logins from the same user (e.g., multiple browser tabs) will not create duplicate organizations because the `userId` has a unique constraint.

#### `MembershipResolverService` — `application/membership-resolver.service.ts`

A service that, given a `userId`, looks up all active `org_members` rows to determine which orgs the user belongs to and in what role. Called by the JWT guard after token validation. For a single-org user, org context is set automatically. For multi-org users, all memberships are returned and the frontend presents the org picker. It also checks the `platform_admins` table to set `isPlatformAdmin`. Handles REMOVED status — removed members receive 403 despite a valid JWT.

#### `Principal` — `domain/principal.ts`

A value object attached to every authenticated request. It carries five fields: `userId` (internal PK in the `users` table; `auth_user_id` holds the OIDC sub), `organizationId` (scopes every query and the RLS session variable), `role` (MemberRole: ADMIN/MEMBER/MAINTAINER, read from `org_members`), `isPlatformAdmin` (boolean, set when a row exists in `platform_admins` for this user), and `subscriptionStatus` (used by the subscription gate). Every controller that needs to know who is calling receives this object via `@Req() req: FastifyRequest & { user: Principal }`.

---

### Booking Module (`src/booking/`)

#### `Booking` — `domain/model/booking.ts`

The core domain aggregate for the booking bounded context. It encapsulates the identity (UUID), host reference, guest details (email, name), time window (startsAt, endsAt), conferencing join URL, and status lifecycle. Business rules that belong to the booking concept — such as "a booking cannot be rescheduled after it is cancelled" — are encoded here as methods rather than scattered across use cases.

#### Inbound Ports (use case interfaces)

These TypeScript interfaces in `domain/ports/inbound/` define the operations the HTTP controller can call. They exist so the controller depends on an interface rather than a concrete class, enabling the use cases to be tested independently and swapped without changing the controller.

- **`BookSlotUseCase`** — `execute({ hostId, meetingTypeId, guestEmail, guestName, startsAt, answers, idempotencyKey })` → creates a booking
- **`CancelBookingUseCase`** — `execute({ bookingId, principalId, reason })` → cancels a booking
- **`RescheduleBookingUseCase`** — `execute({ bookingId, principalId, newStartsAt })` → atomically shifts a booking

#### Outbound Ports (adapter interfaces)

These interfaces in `domain/ports/outbound/` define what the use cases need from the outside world. Defined in the domain layer so the domain has no dependency on any infrastructure technology.

- **`BookingRepository`** — persistence: find by ID/idempotency key, insert, update status
- **`EventPublisher`** — writes a domain event to the outbox table within the current transaction
- **`RealtimePublisher`** — sends a lightweight signal to Redis after a booking changes, triggering SSE push to connected browsers
- **`EmailDispatcher`** — sends confirmation or cancellation emails to guest and host
- **`CalendarProvider`** — syncs bookings to Google Calendar or Outlook (currently a no-op stub)
- **`MeetingProvider`** — generates video meeting links (Zoom, Google Meet, etc.) — currently a no-op stub
- **`TokenVault`** — encrypts and decrypts OAuth tokens for calendar provider integrations
- **`AiProposal`** — requests slot suggestions from the AI service given a natural-language intent

#### `BookSlotUseCase` — `application/book-slot.use-case.ts`

The most critical use case in the system. It:
1. Checks for an existing booking with the same `idempotency_key` and returns it early if found
2. Validates the host exists and the meeting type belongs to the org
3. Calls `BookingRepository.save()` and `EventPublisher.publish()` in the same transaction
4. Returns the created booking

It never checks for slot conflicts in application code — it relies entirely on the PostgreSQL `EXCLUDE` constraint to reject overlapping bookings with a constraint violation, which it maps to a 409 response.

#### `CancelBookingUseCase` — `application/cancel-booking.use-case.ts`

Validates that the caller owns the booking (or is an ADMIN in the org), transitions the status to CANCELLED, and publishes a `booking.cancelled` event to the outbox. The notification worker will pick this up and send the cancellation email.

#### `RescheduleBookingUseCase` — `application/reschedule-booking.use-case.ts`

Atomically updates `starts_at` and `ends_at` for a booking. The PostgreSQL EXCLUDE constraint applies on UPDATE as well as INSERT, so if the new time slot overlaps another booking, the transaction rolls back and a 409 is returned. No application-level slot checking is needed.

#### `PrismaBookingRepository` — `infrastructure/persistence/prisma-booking.repository.ts`

Implements `BookingRepository` using Prisma. Handles the impedance mismatch between the domain `Booking` aggregate and the Prisma model (e.g., mapping status enums, converting `Date` objects). All queries include `where: { organizationId: principal.organizationId }` to enforce tenant isolation.

#### `OutboxEventPublisher` — `infrastructure/messaging/outbox-event-publisher.ts`

Implements `EventPublisher`. Takes the current Prisma transaction client as a parameter and inserts a row into the `outbox` table within that transaction. This is the critical piece of the transactional outbox: because the outbox insert is inside the same `BEGIN/COMMIT` as the booking insert, both succeed or both fail together. There is no scenario where a booking is created without a corresponding outbox event.

#### `RedisRealtimePublisher` — `infrastructure/messaging/redis-realtime-publisher.ts`

Implements `RealtimePublisher`. After a booking transaction commits, this adapter publishes a lightweight message (just an event type and booking ID) to a Redis pub/sub channel named `dhp:realtime:<organizationId>`. The Core API's SSE handler is subscribed to this channel and forwards the message to connected browser clients. This happens outside the database transaction — it is a best-effort notification, not a guaranteed delivery. The outbox pattern handles reliable notification; Redis pub/sub handles low-latency UI updates.

#### `RedisProvider` — `infrastructure/messaging/redis.provider.ts`

A NestJS provider that creates and exports a singleton ioredis client for use within the booking module. It reads `REDIS_URL` from environment variables and creates the connection on module initialization. Having a single client shared across the module avoids connection pool exhaustion.

#### `LogEmailDispatcher` — `infrastructure/email/log-email-dispatcher.ts`

A development stub that implements `EmailDispatcher` by writing the email content to the application log instead of sending it. This allows the full booking flow — including "email sent" log lines — to work in local dev without configuring an actual email provider. Swapped for a real SES or SendGrid adapter in production by changing the DI binding in `app.module.ts`.

#### `NoOpCalendarProvider` — `infrastructure/calendar/no-op-calendar-provider.ts`

Implements `CalendarProvider` with methods that return successfully without doing anything. Placeholder until Google Calendar and Microsoft Outlook integrations are built. The port interface is already defined so adding real integrations is a matter of writing an adapter and updating the DI binding.

#### `NoOpMeetingProvider` — `infrastructure/meeting/no-op-meeting-provider.ts`

Implements `MeetingProvider` similarly. Returns a placeholder join URL. Real implementations for Zoom, Google Meet, and Teams will implement the same port interface.

#### `AesTokenVault` — `infrastructure/vault/aes-token-vault.ts`

Implements `TokenVault` using AES-256 envelope encryption. OAuth tokens for calendar integrations (Google, Microsoft) contain sensitive refresh tokens that must not be stored in plaintext. This adapter encrypts them before writing to `oauth_integrations` and decrypts them on read. The encryption key comes from `TOKEN_VAULT_KEY` in environment variables. Envelope encryption means the key can be rotated by re-encrypting the stored tokens without changing the application logic.

#### `BookingController` — `infrastructure/http/booking.controller.ts`

Translates HTTP requests into use case calls and use case results into HTTP responses. Uses Zod schemas (`CreateBookingSchema`, `RescheduleSchema`) for request validation rather than NestJS's class-validator, keeping validation logic co-located with the DTO definition. Reads the `Idempotency-Key` header and passes it to `BookSlotUseCase`. Reads `req.user` (the `Principal` attached by `AuthplexJwtGuard`) and passes the caller's identity to every use case.

---

### Meeting Types Module (`src/meeting-types/`)

#### `MeetingType` — `domain/model/meeting-type.ts`

The aggregate representing a bookable appointment template. Key fields: `slug` (URL-safe identifier, unique per org), `name`, `durationMinutes`, `conferencingType` (google_meet, zoom, teams, webex, custom), `bufferBeforeMinutes`, `bufferAfterMinutes` (dead time around appointments), `minNoticeMinutes` (how far in advance a patient must book), `maxDaysInFuture` (how far ahead the booking window opens), `maxPerDay` (daily cap), and `isActive`. The appointment type also owns an ordered list of patient intake `Questions`, each with typed `Options`.

#### `CreateMeetingTypeUseCase` — `application/create-meeting-type.use-case.ts`

Validates that the `slug` does not already exist in the organization, then inserts the meeting type together with its questions and options in a single transaction. Slug uniqueness is enforced both here (for a clear error message) and at the database level (unique index) to handle concurrent creation races.

#### `UpdateMeetingTypeUseCase` — `application/update-meeting-type.use-case.ts`

Accepts a partial update. Validates that the caller owns the meeting type (or is an org ADMIN), then applies the changes. If questions are included in the update, it replaces them entirely (delete-and-reinsert) rather than diffing, because question ordering makes partial merges complex and error-prone.

#### `ArchiveMeetingTypeUseCase` — `application/archive-meeting-type.use-case.ts`

Soft-deletes a meeting type by setting `isActive = false`. Archived meeting types no longer appear in the public booking URL and cannot receive new bookings, but historical bookings referencing them are preserved for audit purposes.

#### `PrismaMeetingTypeRepository` — `infrastructure/persistence/prisma-meeting-type.repository.ts`

Implements `MeetingTypeRepository`. All reads include `where: { organizationId, isActive: true }` unless explicitly fetching an archived type. Questions and options are fetched with `include: { questions: { include: { options: true }, orderBy: { position: 'asc' } } }` to preserve the display order defined by the host.

#### `MeetingTypeController` — `infrastructure/http/meeting-type.controller.ts`

Standard CRUD controller. Validates incoming requests with Zod schemas that mirror the `MeetingType` domain model fields. Returns 404 if the requested type does not exist in the caller's org (tenant isolation — the repository never returns rows from another org so this appears as not-found rather than forbidden).

---

### Organization Module (`src/organization/`)

#### `Organization` — `domain/model/organization.ts`

The tenant root aggregate. Every resource in DHP (users, bookings, meeting types) belongs to exactly one organization. The `slug` is chosen at creation time and appears in public booking URLs — it cannot be changed after creation to avoid breaking existing links. The subscription fields (`status`, `expiresAt`, `billingProviderCustomerId`) are updated by the billing webhook handler when payment events arrive.

#### `OrgMember` — `domain/model/membership.ts`

Represents the relationship between a User and an Organization within `org_members`. Carries role (ADMIN/MEMBER/MAINTAINER) and lifecycle status (INVITED/ACTIVE/REMOVED). A user may have multiple `org_members` rows — one per org they belong to (e.g. a doctor at multiple hospitals). The `invitedBy` field records which admin sent the invitation. Status transitions: INVITED → ACTIVE → REMOVED. Physical deletion never happens.

#### `CreateOrganizationUseCase` — `application/create-organization.use-case.ts`

Called during first-login user provisioning. Creates the `Organization` record and immediately creates an `ADMIN` `Membership` for the founding user in the same transaction. The org slug is generated from the user's email prefix (the part before `@`) and made URL-safe. If a slug collision occurs (another org already has that slug), a numeric suffix is appended.

#### `InviteMemberUseCase` — `application/invite-member.use-case.ts`

Checks that the caller is an ADMIN, verifies the invitee's email is not already an active member, inserts an `INVITED` membership, and calls `EmailDispatcher.sendInvite()`. The invite email contains a link that, when clicked, calls `POST /auth/provision` for the invitee and transitions their membership to ACTIVE.

#### `RemoveMemberUseCase` — `application/remove-member.use-case.ts`

Sets the target membership status to `REMOVED`. Validates the caller is an ADMIN and is not removing themselves (an org must always have at least one ADMIN). Removed members lose API access immediately because `MembershipResolverService` only returns ACTIVE memberships when constructing the `Principal`.

#### `AcceptInviteUseCase` — `application/accept-invite.use-case.ts`

Transitions a membership from `INVITED` to `ACTIVE`. Called when an invited user completes the login flow for the first time. Uses the OIDC `sub` to match the invitation to the correct user.

#### `PrismaOrganizationRepository` — `infrastructure/persistence/prisma-organization.repository.ts`

Implements `OrganizationRepository`. Key responsibility: the `findByUserId` method, which the JWT guard calls on every request to load the organization context for the authenticated user.

#### `PrismaMembershipRepository` — `infrastructure/persistence/prisma-membership.repository.ts`

Implements `MembershipRepository`. Handles INVITED/ACTIVE/REMOVED status transitions and enforces the invariant that there is always at least one ADMIN in the organization by rejecting a REMOVE operation that would leave none.

#### `OrganizationController` — `infrastructure/http/organization.controller.ts`

Exposes organization management endpoints. Uses the `/me` convention (e.g., `GET /api/v1/organizations/me`) so callers do not need to know their own organization ID — it is derived from `req.user.organizationId`. All endpoints require Bearer auth; member management endpoints additionally require ADMIN role via `@RequireRole('ADMIN')`.

---

### Availability Module (`src/availability/`)

#### `AvailabilityEngine` — `domain/model/availability-engine.ts`

A pure function (no I/O) that computes open booking windows. Given a list of `AvailabilityRule` records (recurring weekly slots), a list of `AvailabilityOverride` records (date-specific exceptions), and a list of already-booked intervals, it returns the set of free time windows for a given date range.

The algorithm: for each requested date, find the applicable rules for that day-of-week, apply any override for that specific date (override wins), convert to absolute timestamps in the healthcare provider's timezone, then subtract the booked intervals. The result is a list of open slots at the appointment type's configured duration.

This is the most tested component in the codebase (`domain/model/__tests__/availability-engine.test.ts`) because it is pure logic with no external dependencies — every edge case (midnight-spanning slots, DST transitions, fully-booked days, override-closed days) is verified with fast unit tests.

#### `AvailabilityInterval` — `domain/model/availability-interval.ts`

A value object representing a concrete time window with an absolute `start` and `end` as `Date` objects. Immutable after creation. Used as both the input (booked intervals) and output (free windows) of the availability engine.

#### `TimeRange` — `domain/model/time-range.ts`

A value object representing a time-of-day window as `{ startTime: string, endTime: string }` in `HH:mm` format. Used in `AvailabilityRule` records to express recurring availability ("Monday 09:00–17:00") without coupling to a specific date or timezone. The engine combines a `TimeRange` with a date and a timezone to produce an `AvailabilityInterval`.

#### `AvailabilityController` — `infrastructure/http/availability.controller.ts`

Handles availability queries. For a given date range and host, it fetches the host's default schedule + rules, any overrides in that range, and the existing bookings, then passes everything to `AvailabilityEngine` and returns the open windows. This controller intentionally has no use case layer between it and the engine because availability querying is a read-only computation with no business rules beyond what the engine encodes.

---

### Platform Module (`src/platform/`)

#### `PlatformAdminGuard` — `infrastructure/platform-admin.guard.ts`

A NestJS guard applied to all routes under `/platform/**`. Unlike `RbacGuard`, which checks org-scoped roles, this guard checks `principal.isPlatformAdmin`. If false, it returns 403. Super Admins operate cross-org — they bypass `SET LOCAL app.current_organization_id` entirely. Every request that passes this guard writes an entry to `platform_admin_access_log` via an after-interceptor.

#### `PlatformController` — `infrastructure/http/platform.controller.ts`

Exposes the Super Admin management surface. Org CRUD does not go through the org-scoped `OrganizationRepository` — it uses a separate `PlatformOrganizationRepository` that runs without the RLS session variable. Routes: `GET/POST /platform/orgs`, `PATCH/DELETE /platform/orgs/:id`, `GET/POST /platform/orgs/:id/admins`, `DELETE /platform/orgs/:id/admins/:userId`, `GET /platform/stats`.

---

### Feature Flags Module (`src/feature-flags/`)

#### `FeatureFlagController` — `infrastructure/http/feature-flags.controller.ts`

Exposes the Org Admin's feature configuration surface. `GET /feature-flags` returns the full list of platform features joined with this org's enabled/disabled state from `org_features`. `PATCH /feature-flags/:flagName` toggles a feature. Requires `@RequireRoles('ADMIN')`. Changes are auto-logged to `rbac_audit` by the DB trigger on `org_features`.

---

### RBAC Module (`src/rbac/`)

#### `RbacController` — `infrastructure/http/rbac.controller.ts`

Manages role-permission assignments and user-role grants within an org. `GET /rbac/roles` lists roles with their permissions. `POST /rbac/user-roles` assigns a role to a user in this org (inserts into `user_roles`, which triggers the `rbac_audit` DB trigger). `DELETE /rbac/user-roles/:id` revokes. All endpoints require `@RequireRoles('ADMIN')`. The controller never reads from `admin_audit` or `rbac_audit` — those are write-only from the application's perspective.

---

### Shared Kernel (`src/shared-kernel/`)

#### `Result<T, E>` — `domain/result.ts`

A discriminated union type used throughout the domain and application layers to represent outcomes without throwing exceptions. `Result.ok(value)` wraps a success; `Result.err(error)` wraps a failure. Callers use `result.isOk()` / `result.isErr()` to branch.

The advantage over throwing is that errors become part of the function's type signature — a use case that returns `Result<Booking, BookingError>` makes it impossible for a caller to forget to handle the error case. Exceptions are still used at the infrastructure boundary (controllers throw NestJS `HttpException` subclasses) but are never thrown from domain or application code.

#### `ClockPort` — `domain/clock.port.ts`

An interface with a single method: `now(): Date`. Used by use cases and the availability engine instead of calling `new Date()` directly. In production the `SystemClockAdapter` implementation is injected. In tests a `FakeClock` can be injected with a fixed timestamp, making time-dependent logic fully deterministic without mocking global state.

#### `IdGeneratorPort` — `domain/id-generator.port.ts`

An interface with a single method: `generate(): string`. Used wherever a new UUID is needed. In production `UuidIdGeneratorAdapter` wraps `crypto.randomUUID()`. In tests a `SequentialIdGenerator` can be injected to produce predictable IDs (`"id-1"`, `"id-2"`, ...), making assertions on created entities straightforward.

#### `ErrorMapper` — `infrastructure/http/error-mapper.ts`

Translates domain `Result` error values into NestJS `HttpException` instances with appropriate HTTP status codes. For example, a `BookingError.SLOT_CONFLICT` maps to 409, a `BookingError.NOT_FOUND` maps to 404. Controllers call this mapper rather than containing their own status-code logic, keeping the mapping consistent across all endpoints.

---

### Infrastructure (`src/infrastructure/`)

#### `PrismaService` — `persistence/prisma.service.ts`

A NestJS injectable service that wraps the Prisma client. It connects to the database on module init and disconnects on module destroy (supporting graceful shutdown). It also applies a soft-delete Prisma middleware that automatically adds `WHERE deleted_at IS NULL` to all find queries and converts `delete` operations to `UPDATE ... SET deleted_at = NOW()`, so physical deletion never happens in the application.

Multiple feature modules inject `PrismaService` directly rather than going through an abstract persistence port, because Prisma is treated as a stable infrastructure dependency (not something that will be swapped). Repository adapters use it as their underlying database client.

#### `SystemClockAdapter` — `clock/system-clock.adapter.ts`

Implements `ClockPort` by returning `new Date()`. Registered as the production binding for `ClockPort` in `app.module.ts`. Has no logic of its own — it exists solely to satisfy the dependency inversion principle so use cases do not import `Date` globally.

#### `UuidIdGeneratorAdapter` — `id-generator/uuid-id-generator.adapter.ts`

Implements `IdGeneratorPort` by returning `crypto.randomUUID()`. Same rationale as `SystemClockAdapter` — enables ID generation to be controlled in tests without patching globals.

---

### Health (`src/health/`)

#### `HealthController` — `health/health.controller.ts`

Two endpoints used by the container orchestrator:
- `GET /health` — liveness probe. Returns 200 immediately if the process is running. No DB check — a DB failure should not kill the instance (it might recover).
- `GET /readiness` — readiness probe. Checks that both PostgreSQL (via a `SELECT 1` through Prisma) and Redis (via a PING) are reachable. Returns 503 if either is down. The load balancer stops routing traffic to an instance that fails readiness, preventing requests from hitting an instance that cannot serve them.

Both endpoints are decorated with `@PublicEndpoint()` so the JWT guard does not require a token for health checks.

---

## Notification Worker (`apps/notification-worker`)

#### `main.ts`

Initialises the two external connections (Prisma for Postgres, ioredis for Redis) and starts the drain loop. It handles `SIGTERM` and `SIGINT` to allow in-progress drain cycles to complete before shutting down, preventing partial message processing.

#### `outbox-drain.ts`

The core of the worker. It runs on a polling interval (configurable, default 5 seconds) and executes this loop:

1. `SELECT id, event_type, payload FROM outbox WHERE status = 'PENDING' ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED`
2. For each row, dispatch the appropriate side effect based on `event_type` (send email, deliver webhook, etc.)
3. If the dispatch succeeds: `UPDATE outbox SET status = 'DONE'`
4. If it fails: `UPDATE outbox SET attempts = attempts + 1, next_retry_at = NOW() + interval`. After a configured max attempts: `UPDATE outbox SET status = 'DEAD'`
5. Publish a Redis pub/sub event for each processed row so the SSE layer can push to browsers

`FOR UPDATE SKIP LOCKED` is the key to safe concurrent processing. If multiple worker instances run simultaneously (for resilience), each one locks only the rows it selects and skips rows locked by other instances. This prevents double-processing without a distributed lock.

#### `logger.ts`

Pino logger configured identically to the Core API — structured JSON output with the same redaction rules. Having consistent log format across all services means log aggregation tools (Grafana Loki, Datadog) can apply the same parsing pipeline to all DHP services.

---

## AI Service (`apps/ai-service`)

#### `main.py`

The FastAPI application factory. Registers the HTTP router, attaches the authentication middleware, and configures the structured JSON logging setup. Also wires the LangChain adapter and embedding repository into the FastAPI dependency injection system.

#### `settings.py`

Pydantic `BaseSettings` subclass. Reads all configuration from environment variables with type coercion and validation at startup. Fails fast with a clear error if a required variable (e.g., `OPENAI_API_KEY`) is missing, rather than failing later at request time.

#### `middleware.py`

FastAPI middleware that validates the `Authorization: Bearer <service_token>` header on every request. The service token is a short-lived HMAC-SHA256 token generated by the Core API and verified here against `SERVICE_TOKEN_SECRET`. This prevents the AI service from being called by anything other than the Core API — it is not exposed to the public internet.

#### `routes.py`

Two endpoints:
- `POST /parse-intent` — accepts a free-text scheduling request and returns a structured `SchedulingIntent`
- `POST /suggest-slots` — given a `SchedulingIntent` and the host's available windows, returns ranked slot suggestions

Both endpoints delegate to application-layer use cases and return structured JSON responses. They are documented with FastAPI's automatic OpenAPI generation (separate from the Core API's Swagger).

#### `ParseIntentUseCase` — `application/parse_intent_use_case.py`

Orchestrates the LLM call for intent parsing. It retrieves similar historical intents from the `AiEmbedding` store (few-shot retrieval), constructs a prompt with those examples, calls the LLM via the `LlmRunnable` port, and parses the response into a `SchedulingIntent`. Storing similar past intents in the prompt helps the model produce more accurate structured output for domain-specific appointment request language.

#### `SchedulingIntent` — `domain/model/scheduling_intent.py`

The domain model output of intent parsing. Fields include: `duration_minutes` (extracted or inferred), `preferred_time_of_day` (morning, afternoon, evening), `preferred_days` (list of weekday names), `timezone` (extracted from context), `constraints` (list of natural-language constraints like "not Mondays"). This structured object is what the slot suggestion logic consumes.

#### `EmbeddingRepository` — `domain/ports/embedding_repository.py`

Port interface for storing and querying embedding vectors. The implementation uses pgvector's `<->` cosine distance operator to find semantically similar historical intents. Embeddings are generated by the LangChain adapter using the OpenAI embeddings API and stored in the `ai_embeddings` table in PostgreSQL.

#### `LlmRunnable` — `domain/ports/llm_runnable.py`

Port interface that wraps a LangChain runnable (chain). Abstracts the choice of LLM provider so the use case does not know whether it is talking to OpenAI or Anthropic. The adapter for each provider is selected based on `LLM_PROVIDER` in environment variables.

#### `LangChainAdapter` — `infrastructure/llm/langchain_adapter.py`

Implements `LlmRunnable`. Constructs a LangChain chain consisting of a prompt template, the configured LLM (OpenAI GPT-4o or Anthropic Claude), and a structured output parser that coerces the LLM response into a `SchedulingIntent`. Uses LangChain's `with_structured_output` to force JSON-mode output and retry on parse failure.

---

## Shared Packages (`packages/`)

### `packages/types`

A TypeScript-only package with zero runtime dependencies. It is compiled and imported by both `core-api` and `web`. Its purpose is to define the contract between the server and the client at the type level, so a breaking change to an API response shape is caught at compile time rather than at runtime in the browser.

- **`api/dtos.ts`** — Request and response type shapes for every Core API endpoint. These match the Zod validation schemas in the controllers — if the two diverge, TypeScript will catch it.
- **`api/error-envelope.ts`** — The standard error response shape `{ error: { code: string, message: string } }` that all API errors follow.
- **`domain/booking.ts`** — `Booking`, `BookingStatus` enum, `BookingAnswer` — the client-side representation of a booking.
- **`domain/organization.ts`** — `Organization`, `Membership`, `MemberRole`, `MembershipStatus` — shared org types.
- **`domain/availability.ts`** — `AvailabilityWindow`, `AvailabilityRule`, `AvailabilityOverride` — types used by the public booking page when rendering the slot picker.
- **`domain/realtime.ts`** — SSE event payload types so the `useRealtimeChannel` hook and the SSE emitter on the server share the same event structure.
- **`domain/result.ts`** — The `Result<T, E>` discriminated union mirrored from `core-api`'s shared-kernel for use in client-side data transformation utilities.

### `packages/config`

Shared tooling configuration consumed by all apps in the monorepo via `extends` in their own `tsconfig.json` and `eslint.config.js`. Contains no runtime code — it is a dev-time dependency only. Centralising config here means a TypeScript compiler option change or ESLint rule addition applies to all apps simultaneously.

---

## Data Stores

### PostgreSQL (`dhp_dev`)

The primary data store for all persistent state. Runs on port 5433 (non-default to avoid clashing with a system Postgres on 5432).

The database is divided into two logical schemas:
- **`public`** — all DHP application tables. Schema is owned by Flyway (applies `migrations/V*.sql` files) and read/written by Prisma in the Core API and notification worker.
- **`authplex`** — identity tables owned entirely by AuthPlex. DHP application code never directly reads or writes these tables. AuthPlex's embedded Go migrations manage the schema. The two schemas coexist in the same database in local dev for simplicity; in production they are separate databases.

Three PostgreSQL extensions are created by `scripts/init-db.sql` before any migrations run:
- **`uuid-ossp`** — provides `uuid_generate_v4()` used as the default value for UUID primary keys
- **`btree_gist`** — extends GiST indexes to support the `EXCLUDE` constraint on the bookings table that prevents double-booking
- **`vector`** (pgvector) — adds the `vector` column type and distance operators (`<->`, `<=>`) for storing and querying AI embedding vectors in the `ai_embeddings` table

Row-Level Security is enabled on all tenant-scoped tables with `FORCE ROW LEVEL SECURITY`. Policies use `current_setting('app.tenant_id', true)` so the database enforces tenant isolation even if application code omits a `WHERE organization_id = ?` filter.

### Redis 7

Runs on port 6380 (non-default) with password authentication (`dhp_redis_password`). Used for two independent purposes that do not interfere with each other:

**BullMQ queue (`bull:*` keys)** — the notification worker enqueues and dequeues jobs here. BullMQ provides at-least-once delivery semantics, job retries with backoff, and a dead-letter queue. Jobs are used for background tasks that are heavier than a simple outbox dispatch (e.g., scheduling batch reminder emails).

**Real-time pub/sub (`dhp:realtime:<orgId>` channels)** — the Core API publishes a lightweight signal here after every booking state change. The SSE handler subscribes to the relevant org channel and forwards events to connected browser `EventSource` connections. This is best-effort (no persistence, no retry) — if the browser misses a signal, the next user action will re-fetch anyway.

---

## AuthPlex (OIDC Identity Provider)

A self-hosted OIDC provider written in Go, running in the `hams` project. It manages users, tenants, and OIDC client registrations entirely within its own schema.

- **`POST /login`** — Validates `{ email, password }` against bcrypt hashes in `authplex.users`. Returns a short-lived `session_token` that proves the user authenticated. This token is used only in the next step (`/authorize`) and is not the final access token.
- **`GET /authorize`** — The PKCE authorization endpoint. Requires a valid `session_token` in the `Authorization` header. Validates the `code_challenge`, generates a one-time authorization code, and returns it via a 302 redirect to the configured `redirect_uri`. The Core API follows this redirect manually.
- **`POST /token`** — Exchanges the authorization code and PKCE `code_verifier` for a signed RS256 JWT access token. Validates that the verifier matches the challenge stored during `/authorize`. Invalidates the code after use.
- **`GET /jwks`** — Returns the tenant's public JWK set (the public key corresponding to the private key used to sign JWTs). Requires the `X-Tenant-ID` header — without it, the response contains an empty key array. The Core API's `JwksCache` calls this endpoint and caches the result for 10 minutes.
- **`GET /.well-known/openid-configuration`** — The OIDC discovery document. Describes the issuer, all endpoint URLs, supported scopes, and signing algorithms. Standard-compliant clients can auto-configure from this document.
- **`GET /health`** — Returns 200 if the service is alive. Used by Docker Compose health checks to gate service startup order.
- **`POST /admin/bootstrap`** — One-time endpoint to create the first AuthPlex super-admin user. Requires the `AUTHPLEX_ADMIN_API_KEY` in the request body and only succeeds when no admin users exist yet.
- **Migration `022_seed_dhp_dev.sql`** — Seeds the development tenant (`4aa2670c-...`), the DHP OIDC client (`5BOOTLIGWdWN9Y1OYrjk7A`), and the default dev user (`ananta.sai@tekisho.ai` / `Admin@1234`) on first container startup. This migration runs automatically via AuthPlex's embedded Go migration runner, so new dev environments require no manual setup.
